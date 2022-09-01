jest.mock("axios");

const integration = "hs";
const name = "Hubspot";

const fs = require("fs");
const path = require("path");
const version = "v0";

const {workflowEngine} = require(`../${version}/destinations/${integration}/index`);

// Processor Test files
const inputDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_input.json`)
);
const outputDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_output.json`)
);
const inputData = JSON.parse(inputDataFile);
const expectedData = JSON.parse(outputDataFile);

// Router Legacy Test files
const inputLegacyRouterDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_input_legacy.json`)
);
const outputLegacyRouterDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_output_legacy.json`)
);
const inputLegacyRouterData = JSON.parse(inputLegacyRouterDataFile);
const expectedLegacyRouterData = JSON.parse(outputLegacyRouterDataFile);

// Router Test files (New API)
const inputRouterDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_input.json`)
);
const outputRouterDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_output.json`)
);
const inputRouterData = JSON.parse(inputRouterDataFile);
const expectedRouterData = JSON.parse(outputRouterDataFile);

// Router Test files for rETL sources
const inputRouterDataFilerETL = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_rETL_input.json`)
);
const outputRouterDataFilerETL = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_rETL_output.json`)
);
const inputRouterDatarETL = JSON.parse(inputRouterDataFilerETL);
const expectedRouterDatarETL = JSON.parse(outputRouterDataFilerETL);

// Router Test files for rETL sources (legacy)
const inputRouterDataFilerETLLegacy = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_legacy_rETL_input.json`)
);
const outputRouterDataFilerETLLegacy = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_router_legacy_rETL_output.json`)
);
const inputRouterDatarETLLegacy = JSON.parse(inputRouterDataFilerETLLegacy);
const expectedRouterDatarETLLegacy = JSON.parse(outputRouterDataFilerETLLegacy);

describe(`${name} Tests`, () => {
  describe("Processor", () => {
    inputData.forEach(async (input, index) => {
      if (index != 1) {
        return
      }
      it(`Payload - ${index}`, async () => {
        try {
          const result = await workflowEngine.execute(input);
          if (result.error) {
            throw result.error
          }
          expect(result.output).toEqual(expectedData[index]);
        } catch (error) {
          expect(error.message).toEqual(expectedData[index].error);
        }
      });
    });
  });
});
