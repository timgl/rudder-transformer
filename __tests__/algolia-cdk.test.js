const integration = "algolia";
const name = "algolia";

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

inputData.forEach((input, index) => {
  it(`${name} Tests: payload - ${index}`, async () => {
    const expected = expectedData[index]
    try {
      const result = await singleWorkflowEngine.execute(input);
      expect(JSON.parse(JSON.stringify(result.output))).toEqual(expected);
    } catch (error) {
      expect(error.message).toEqual(expected.message);
    }    
  });
});

const batchInputDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_batch_input.json`)
);
const batchOutputDataFile = fs.readFileSync(
  path.resolve(__dirname, `./data/${integration}_batch_output.json`)
);

// Batching using routerTransform
test('Batching', async () => {
  const batchInputData = JSON.parse(batchInputDataFile);
  const batchExpectedData = JSON.parse(batchOutputDataFile);
  const result = await batchWorkflowEngine.execute(batchInputData);
  expect(JSON.parse(JSON.stringify(result.output))).toEqual(batchExpectedData);
});
