import { test } from "vitest";
import { HrpcTransport } from "../build/es2015/src";

test("can import HrpcTransport", () => {
  new HrpcTransport({
    baseUrl: "localhost",
  });
});
