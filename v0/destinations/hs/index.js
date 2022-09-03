const { join } = require("path");
const { V2 } = require("rudder-transformer-cdk");

const singleWorkflow = V2.WorkflowUtils.createFromFilePath(
  join(__dirname, "hs_single_workflow2.yaml")
);
const singleWorkflowEngine = new V2.WorkflowEngine(singleWorkflow, __dirname);
exports.singleWorkflowEngine = singleWorkflowEngine;

const batchWorkflow = V2.WorkflowUtils.createFromFilePath(
  join(__dirname, "hs_batch_workflow.yaml")
);
const batchWorkflowEngine = new V2.WorkflowEngine(batchWorkflow, __dirname);
exports.batchWorkflowEngine = batchWorkflowEngine;
