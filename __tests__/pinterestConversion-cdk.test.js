const integration = "pinterest_tag";
const name = "Pinterest Conversion API";

const fs = require("fs");
const path = require("path");
const version = "v0";

const {
  singleWorkflowEngine,
  batchWorkflowEngine
} = require(`../${version}/destinations/${integration}/index`);

const inputDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_input.json`)
);
const outputDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_output.json`)
);
const inputData = JSON.parse(inputDataFile);
const expectedData = JSON.parse(outputDataFile);

// Router Test Data
const inputRouterDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_input.json`)
);
const outputRouterDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_output.json`)
);
const inputRouterData = JSON.parse(inputRouterDataFile);
const expectedRouterData = JSON.parse(outputRouterDataFile);

describe(`${name} Tests`, () => {
  describe("Processor Tests", () => {
    inputData.forEach((input, index) => {
      it(`${name} - payload: ${index}`, async () => {
        const expected = expectedData[index];
        try {
          const result = await singleWorkflowEngine.execute(input);
          expect(JSON.parse(JSON.stringify(result.output))).toEqual(expected);
        } catch (error) {
          expect(error.message).toEqual(expected.error);
        }
      });
    });
  });

  describe("Router Tests", () => {
    it("Payload", async () => {
      const result = await batchWorkflowEngine.execute(inputRouterData);
      expect(JSON.parse(JSON.stringify(result.output))).toEqual(
        expectedRouterData
      );
    });
  });
});
