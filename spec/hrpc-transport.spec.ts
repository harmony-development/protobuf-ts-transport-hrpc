import { HrpcTransport } from "../src/index";

test("can import HrpcTransport", () => {
  new HrpcTransport({
    baseUrl: "localhost",
  });
});
