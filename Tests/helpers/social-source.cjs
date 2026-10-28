const fs=require('node:fs'),path=require('node:path');
// Older focused tests extract individual app functions into a VM. Keep those
// tests on the actual moved source; integration tests run the bundled modules.
module.exports=function socialSource(source){
 if(!source.includes('// BEGIN DEFERRED SOCIAL WORKSPACE'))return source;
 const workspace=fs.readFileSync(path.join(__dirname,'../../social-workspace.js'),'utf8');
 const body=workspace.slice(workspace.indexOf('\nfunction socialFixtureCompleted(')+1,workspace.lastIndexOf('\nreturn {socialOpen:'));
 return source.replace(/\/\/ BEGIN DEFERRED SOCIAL WORKSPACE[\s\S]*?\/\/ END DEFERRED SOCIAL WORKSPACE/,body);
};
module.exports.functionSource=function functionSource(source,name){
 const vm=require('node:vm'),start=source.search(new RegExp('(?:async )?function '+name+'\\('));
 if(start<0)throw Error('Missing function '+name);
 let end=source.indexOf('\n',start);
 while(end>=0){const candidate=source.slice(start,end);try{new vm.Script('('+candidate+'\n)');return candidate;}catch(error){if(!(error instanceof SyntaxError))throw error;}end=source.indexOf('\n',end+1);}
 throw Error('Unclosed function '+name);
};
