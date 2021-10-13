import {
  ClientStreamingCall,
  Deferred,
  DuplexStreamingCall,
  MethodInfo,
  RpcError,
  RpcInputStream,
  RpcMetadata,
  RpcOptions,
  RpcOutputStreamController,
  RpcStatus,
  RpcTransport,
  ServerStreamingCall,
  UnaryCall,
} from "@protobuf-ts/runtime-rpc";
import { Error as HError } from "../gen/protocol/hrpc";

interface HrpcOptions extends RpcOptions {
  baseUrl: string;
}

enum HrpcErrorCode {
  internal,
  dataloss,
  invalid_response,
}

function parseMetadataFromResponseHeaders(headers: Headers): RpcMetadata {
  let meta: RpcMetadata = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-type") return;
    if (key.toLowerCase() === "content-length") return;
    if (meta.hasOwnProperty(key)) (meta[key] as string[]).push(value);
    else meta[key] = value;
  });
  return meta;
}

function makeHeaders(meta?: RpcMetadata, session?: string): Headers {
  const headers = new Headers();

  headers.set("Content-Type", "application/hrpc");
  headers.set("Accept", "application/hrpc");
  if (session) headers.set("Authorization", session);

  if (meta) {
    for (let [k, v] of Object.entries(meta)) {
      if (typeof v === "string") headers.append(k, v);
      else for (let i of v) headers.append(k, i);
    }
  }

  return headers;
}

export class HrpcTransport implements RpcTransport {
  protected readonly defaultOptions: HrpcOptions;
  protected session?: string;

  constructor(options: HrpcOptions) {
    this.defaultOptions = options;
  }

  setSession(session: string) {
    this.session = session;
  }

  mergeOptions(options?: Partial<RpcOptions>): RpcOptions {
    return {
      ...this.defaultOptions,
      ...options,
    };
  }

  makeUrl(method: MethodInfo, options: HrpcOptions, ws?: boolean) {
    let base = options.baseUrl;
    if (base.endsWith("/")) base = base.substring(0, base.length - 1);
    if (ws) base = `wss${base.substr(base.indexOf("://"))}`;
    let methodName = method.name;
    return `${base}/${method.service.typeName}/${methodName}`;
  }

  async processFetch<I extends object, O extends object>(
    fetchPromise: Promise<Response>,
    defHeader: Deferred<RpcMetadata>,
    defMessage: Deferred<O>,
    defStatus: Deferred<RpcStatus>,
    defTrailer: Deferred<RpcMetadata>,
    method: MethodInfo<I, O>,
    opt: HrpcOptions
  ) {
    let resp: Response;

    try {
      resp = await fetchPromise;
    } catch (e: any) {
      throw new RpcError(
        "failed to fetch",
        HrpcErrorCode[HrpcErrorCode.internal]
      );
    }

    defHeader.resolve(parseMetadataFromResponseHeaders(resp.headers));

    if (!resp.body) {
      throw new RpcError(
        "unable to read body",
        HrpcErrorCode[HrpcErrorCode.dataloss]
      );
    }

    switch (resp.type) {
      case "error":
      case "opaque":
      case "opaqueredirect":
        // see https://developer.mozilla.org/en-US/docs/Web/API/Response/type
        throw new RpcError(
          `fetch response type ${resp.type}`,
          HrpcErrorCode[HrpcErrorCode.invalid_response]
        );
    }

    let raw: Uint8Array;
    try {
      raw = new Uint8Array(await resp.arrayBuffer());
    } catch {
      throw new RpcError(
        "failed to read raw body",
        HrpcErrorCode[HrpcErrorCode.internal]
      );
    }

    if (!resp.ok) {
      let parsed: HError;
      try {
        parsed = HError.fromBinary(raw);
      } catch {
        throw new RpcError(
          "unable to decode error response",
          HrpcErrorCode[HrpcErrorCode.invalid_response]
        );
      }
      throw new RpcError(parsed.humanMessage, parsed.identifier);
    }

    try {
      const decoded = method.O.fromBinary(raw, opt.binaryOptions);
      defMessage.resolve(decoded);
      defStatus.resolve({ code: "OK", detail: "" });
      defTrailer.resolve({});
    } catch {
      throw new RpcError(
        "unable to decode response",
        HrpcErrorCode[HrpcErrorCode.invalid_response]
      );
    }
  }

  unary<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: RpcOptions
  ): UnaryCall<I, O> {
    let opt = options as HrpcOptions;
    let url = this.makeUrl(method, opt);
    let requestBody = opt.sendJson
      ? method.I.toJsonString(input, opt.jsonOptions)
      : method.I.toBinary(input, opt.binaryOptions);
    let defHeader = new Deferred<RpcMetadata>();
    let defMessage = new Deferred<O>();
    let defStatus = new Deferred<RpcStatus>();
    let defTrailer = new Deferred<RpcMetadata>();

    this.processFetch(
      fetch(url, {
        method: "POST",
        headers: makeHeaders(opt.meta, this.session),
        body: requestBody,
        signal: options.abort ?? null,
      }),
      defHeader,
      defMessage,
      defStatus,
      defTrailer,
      method,
      opt
    ).catch((reason) => {
      let error =
        reason instanceof RpcError
          ? reason
          : new RpcError(
              reason instanceof Error ? reason.message : reason,
              HrpcErrorCode[HrpcErrorCode.internal]
            );
      defHeader.rejectPending(error);
      defMessage.rejectPending(error);
      defStatus.rejectPending(error);
      defTrailer.rejectPending(error);
    });

    return new UnaryCall<I, O>(
      method,
      opt.meta ?? {},
      input,
      defHeader.promise,
      defMessage.promise,
      defStatus.promise,
      defTrailer.promise
    );
  }

  streamCall<I extends object, O extends object>(
    url: string,
    method: MethodInfo<I, O>
  ): WebSocket {
    const ws = new WebSocket(
      url,
      this.session ? ["harmony", this.session] : ["harmony"]
    );
    ws.binaryType = "arraybuffer";
    return ws;
  }

  serverStreaming<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: RpcOptions
  ): ServerStreamingCall<I, O> {
    let opt = options as HrpcOptions;
    let url = this.makeUrl(method, opt, true);
    let inputBytes = method.I.toBinary(input, opt.binaryOptions);
    let defHeader = new Deferred<RpcMetadata>();
    let responseStream = new RpcOutputStreamController<O>();
    let defStatus = new Deferred<RpcStatus>();
    let defTrailer = new Deferred<RpcMetadata>();

    const ws = this.streamCall(url, method);
    ws.onmessage = (ev) => {
      responseStream.notifyMessage(
        method.O.fromBinary(new Uint8Array(ev.data))
      );
    };
    ws.onclose = (ev) => {
      if (ev.wasClean) responseStream.notifyComplete();
      else responseStream.notifyError(new Error(ev.reason));
    };
    ws.onopen = () => ws.send(inputBytes);

    return new ServerStreamingCall<I, O>(
      method,
      opt.meta ?? {},
      input,
      defHeader.promise,
      responseStream,
      defStatus.promise,
      defTrailer.promise
    );
  }

  clientStreaming<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    options: RpcOptions
  ): ClientStreamingCall<I, O> {
    let opts = options as HrpcOptions;
    let defHeader = new Deferred<RpcMetadata>();
    let defStatus = new Deferred<RpcStatus>();
    let defTrailer = new Deferred<RpcMetadata>();
    let defMessage = new Deferred<O>();
    const ws = this.streamCall(this.makeUrl(method, opts, true), method);
    let requestStream = new HrpcInputStreamWrapper(ws, (v: I) =>
      method.I.toBinary(v, opts.binaryOptions)
    );
    ws.onmessage = (ev) => {
      defMessage.resolve(method.O.fromBinary(new Uint8Array(ev.data)));
      ws.close();
    };
    ws.onclose = (ev) => {
      if (!ev.wasClean) {
        const err = new Error(ev.reason);
        defHeader.rejectPending(err);
        defMessage.rejectPending(err);
        defStatus.rejectPending(err);
        defTrailer.rejectPending(err);
      }
    };
    return new ClientStreamingCall<I, O>(
      method,
      opts.meta ?? {},
      requestStream,
      defHeader.promise,
      defMessage.promise,
      defStatus.promise,
      defTrailer.promise
    );
  }

  duplex<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    options: RpcOptions
  ): DuplexStreamingCall<I, O> {
    let opts = options as HrpcOptions;
    let defHeader = new Deferred<RpcMetadata>();
    let defStatus = new Deferred<RpcStatus>();
    let defTrailer = new Deferred<RpcMetadata>();
    let responseStream = new RpcOutputStreamController<O>();
    const ws = this.streamCall(this.makeUrl(method, opts, true), method);
    ws.onmessage = (ev) => {
      responseStream.notifyMessage(
        method.O.fromBinary(new Uint8Array(ev.data))
      );
    };
    ws.onclose = (ev) => {
      if (ev.wasClean) responseStream.notifyComplete();
      else responseStream.notifyError(new Error(ev.reason));
    };
    let requestStream = new HrpcInputStreamWrapper<I>(ws, (v: I) =>
      method.I.toBinary(v, opts.binaryOptions)
    );
    return new DuplexStreamingCall<I, O>(
      method,
      opts.meta ?? {},
      requestStream,
      defHeader.promise,
      responseStream,
      defStatus.promise,
      defTrailer.promise
    );
  }
}

class HrpcInputStreamWrapper<T> implements RpcInputStream<T> {
  completed: boolean;
  protected sendQueue: Uint8Array[];

  constructor(
    private readonly ws: WebSocket,
    private readonly serializer: (v: T) => Uint8Array
  ) {
    this.completed = false;
    this.sendQueue = [];
    const openHandler = () => {
      this.sendQueue.forEach((msg) => this.ws.send(msg));
      this.ws.removeEventListener("open", openHandler);
    };
    this.ws.addEventListener("open", openHandler);
  }

  send(message: T): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.ws.readyState === 0) {
        this.sendQueue.push(this.serializer(message));
        resolve();
      } else if (this.ws.readyState === 1) {
        this.ws.send(this.serializer(message));
        resolve();
      } else {
        reject("socket is either closing or is closed");
      }
    });
  }

  complete(): Promise<void> {
    this.ws.close();
    this.completed = true;
    return Promise.resolve(undefined);
  }
}
