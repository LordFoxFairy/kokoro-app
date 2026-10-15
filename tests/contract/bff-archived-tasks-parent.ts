import { createHash } from "node:crypto";
const hash=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
/** Consumer proof only: remove the two exact owner-published additive blocks, verify full old bytes. */
export function restorePublic153(bytes:Uint8Array):Buffer {
 let text=Buffer.from(bytes).toString("utf8");
 if(hash(bytes)!=="87186311e67eeebcd5f27d7974326186e1912de49d18d4d524a0bcbc940a0817")throw Error("not fixed public15.4");
 const remove=(start:string,end:string,digest:string)=>{const a=text.indexOf(start),b=text.indexOf(end);if(a<0||b<a||text.indexOf(start,a+start.length)!==-1||hash(text.slice(a,b))!==digest)throw Error("archive block drift");text=text.slice(0,a)+text.slice(b);};
 remove("  /v1/account/archived-tasks:\n","  /v1/account/shared-tasks:\n","edd8ec454cf52e2841a698cbeadec913fbe369ae14589e76b10471ebe5b0ca68");
 remove("    ArchivedTaskItem:\n","    SharedTaskItem:\n","370da2ff30889dbb5f106cce7547097085fa4e5605d3a6e3980cb2a896607c3a");
 if(text.split("  version: 15.4.0\n").length!==2)throw Error("version drift");
 text=text.replace("  version: 15.4.0\n","  version: 15.3.0\n");
 if(hash(text)!=="694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5")throw Error("old public15.3 drift");return Buffer.from(text);
}
