import {createSupportHandler} from './worker.mjs';
// Browser JWTs are insufficient. The handler verifies either the private
// scheduler credential or the receiving provider's signed webhook body.
Deno.serve(createSupportHandler({env:(name:string)=>Deno.env.get(name)||''}));
