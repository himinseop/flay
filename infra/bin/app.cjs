const cdk=require('aws-cdk-lib');
const {FlayStack}=require('../lib/flay-stack.cjs');
const config=require('../config.json');
new FlayStack(new cdk.App(),config.stackName,config);
