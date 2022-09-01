const { join } = require("path");
const { readFileSync } = require("fs");
const { V2 } = require("rudder-transformer-cdk");

const workflowYaml = readFileSync(join(__dirname, "hs_workflow.yaml"), "utf8");
const workflow = V2.WorkflowUtils.createFromYaml(workflowYaml);
const workflowEngine = new V2.WorkflowEngine(workflow, __dirname);
exports.workflowEngine = workflowEngine;
// const hsInputs = JSON.parse(
//   readFileSync(
//     join(__dirname, "../../../__tests__/data/hs_input.json"),
//     "utf-8"
//   )
// );
// const hsOutputs = JSON.parse(
//   readFileSync(
//     join(__dirname, "../../../__tests__/data/hs_output.json"),
//     "utf-8"
//   )
// );

// async function executeAll() {
//   //   for (let i = 0; i < hsInputs.length; i++) {
//   const i = 12;
//   const result = await workflowEngine.execute(hsInputs[i]);
//   console.log(result);
//   console.log(i, "matched", isEqual(result, hsOutputs[i]));
//   // if (i === 0) {
//   //   break
//   // }
//   //   }
// }
// executeAll();
