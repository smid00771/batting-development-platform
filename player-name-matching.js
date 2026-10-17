// Name similarity proposes a human confirmation; it never establishes identity.
export function matchReviewNameParts(value){
 let name=String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\((?:c|capt|captain|wk|wkt|keeper|c\s*\/\s*wk)\)/g,'').replace(/['’]/g,'');
 const reversed=name.split(',');if(reversed.length===2)name=reversed[1]+' '+reversed[0];
 return name.match(/[\p{L}\p{N}]+/gu)||[];
}
export function matchReviewGivenNameMatches(a,b){
 if(a===b)return true;if(!a||!b)return false;
 if(a.length===1||b.length===1)return a[0]===b[0];
 if(Math.min(a.length,b.length)>=3&&(a.startsWith(b)||b.startsWith(a)))return true;
 // Expand short forms, not formal names: Alex may be Alexander or Alexandra,
 // but Alexander and Alexandra must not become interchangeable.
 const short={alex:['alexander','alexandra'],al:['alan','albert','alfred'],andy:['andrew'],ben:['benjamin'],benji:['benjamin'],bill:['william'],billy:['william'],bob:['robert'],bobby:['robert'],chris:['christopher','christian','christine','christina'],dan:['daniel'],danny:['daniel'],dave:['david'],davy:['david'],ed:['edward','edmund','edwin'],eddie:['edward','edmund','edwin'],fred:['frederick'],geoff:['geoffrey'],greg:['gregory'],harry:['harold','henry','harrison'],jake:['jacob'],jim:['james'],jimmy:['james'],jamie:['james'],joe:['joseph'],joey:['joseph'],jon:['john','jonathan'],josh:['joshua'],matt:['matthew'],mat:['matthew'],max:['maxwell','maximilian'],mick:['michael'],mike:['michael'],mikey:['michael'],nick:['nicholas'],ollie:['oliver','olivia'],olly:['oliver'],liv:['olivia'],liz:['elizabeth'],beth:['elizabeth'],kate:['katherine','catherine'],katie:['katherine','catherine'],becky:['rebecca'],bec:['rebecca'],pat:['patrick','patricia'],pete:['peter'],phil:['philip','phillip'],rich:['richard'],rick:['richard'],ricky:['richard'],rob:['robert'],robbie:['robert'],sam:['samuel','samantha'],steve:['steven','stephen'],stevie:['steven','stephen'],ted:['theodore','edward'],tim:['timothy'],tom:['thomas'],tommy:['thomas'],tony:['anthony'],will:['william'],vince:['vincent'],zac:['zachary'],zack:['zachary']};
 const fullA=[a,...(short[a]||[])],fullB=[b,...(short[b]||[])];return fullA.some(name=>fullB.includes(name));
}
export function matchReviewShortNameMatches(a,b){
 if(!a.length||!b.length)return false;
 if(a.length===1||b.length===1){const single=a.length===1?a:b,full=a.length===1?b:a;return single[0].length>=3&&full[0].length>=3&&matchReviewGivenNameMatches(single[0],full[0]);}
 if(a.at(-1)!==b.at(-1)||!matchReviewGivenNameMatches(a[0],b[0]))return false;
 const middleA=a.slice(1,-1),middleB=b.slice(1,-1);
 return middleA.slice(0,middleB.length).every((part,n)=>matchReviewGivenNameMatches(part,middleB[n]));
}
