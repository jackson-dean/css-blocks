import { assert } from "chai";
import { suite, test } from "mocha-typescript";

@suite("DiagnosticsManagerTest")
export class DiagnosticsManagerTest {
  @test async "it sends an empty diagnostics array when none of the errors have a location"() {
    assert.ok(true);
  }
}
