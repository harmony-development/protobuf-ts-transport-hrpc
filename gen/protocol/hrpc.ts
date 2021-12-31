// @generated by protobuf-ts 2.0.7 with parameter long_type_string,force_optimize_code_size
// @generated from protobuf file "protocol/hrpc.proto" (package "hrpc.v1", syntax proto3)
// tslint:disable
import { MessageType } from "@protobuf-ts/runtime";
/**
 * Error type that will be returned by servers.
 *
 * @generated from protobuf message hrpc.v1.Error
 */
export interface Error {
    /**
     * The identifier of this error, can be used as an i18n key.
     *
     * @generated from protobuf field: string identifier = 1;
     */
    identifier: string;
    /**
     * A human readable message in English, explaining why the error occured.
     *
     * @generated from protobuf field: string human_message = 2;
     */
    humanMessage: string;
    /**
     * Details about this message. This is dependent on the error identifier.
     *
     * @generated from protobuf field: bytes details = 3;
     */
    details: Uint8Array;
}
/**
 * Information that can be used by clients for retrying requests.
 *
 * @generated from protobuf message hrpc.v1.RetryInfo
 */
export interface RetryInfo {
    /**
     * How many seconds to wait before retrying the request.
     *
     * @generated from protobuf field: uint32 retry_after = 1;
     */
    retryAfter: number;
}
// @generated message type with reflection information, may provide speed optimized methods
class Error$Type extends MessageType<Error> {
    constructor() {
        super("hrpc.v1.Error", [
            { no: 1, name: "identifier", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "human_message", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "details", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message hrpc.v1.Error
 */
export const Error = new Error$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RetryInfo$Type extends MessageType<RetryInfo> {
    constructor() {
        super("hrpc.v1.RetryInfo", [
            { no: 1, name: "retry_after", kind: "scalar", T: 13 /*ScalarType.UINT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message hrpc.v1.RetryInfo
 */
export const RetryInfo = new RetryInfo$Type();
