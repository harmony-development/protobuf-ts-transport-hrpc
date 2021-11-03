# protobuf-ts-transport-hrpc

hRPC transport for protobuf-ts

Example usage:
```ts
import { ChatServiceClient } from "../gen/chat.client";
import { HrpcTransport } from "@harmony-dev/transport-hrpc";

// ChatServiceClient is the generated protobuf-ts client. Read protobuf-ts's usage guide for more details
const client = new ChatServiceClient(
  new HrpcTransport({
    // the service's URL for access.
    baseUrl: "http://localhost:6969",
  })
);
```
