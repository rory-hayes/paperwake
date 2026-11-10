/** Exact decimal strings only: no exponent, separators, currency symbols or binary floats. */
export function isExactDecimal(value:unknown):value is string {
 return typeof value==='string'&&value.length<=64&&/^-?\d+(?:\.\d+)?$/.test(value);
}
function parts(value:string){const [whole,fraction='']=value.split('.');return {coefficient:BigInt(whole+fraction),scale:fraction.length};}
/** Compare a decimal sum with a stated total, allowing at most one cent of rounding. */
export function decimalSumMatches(values:string[],expected:string,tolerance='0.01'){
 const numbers=[...values,expected,tolerance].map(parts),scale=Math.max(...numbers.map(value=>value.scale));
 const aligned=numbers.map(value=>value.coefficient*10n**BigInt(scale-value.scale));
 const limit=aligned.pop()!,target=aligned.pop()!,actual=aligned.reduce((sum,value)=>sum+value,0n),difference=actual-target;
 return (difference<0n?-difference:difference)<=limit;
}
export function decimalProductMatches(left:string,right:string,expected:string,tolerance='0.01'){
 const a=parts(left),b=parts(right),target=parts(expected),limit=parts(tolerance),product={coefficient:a.coefficient*b.coefficient,scale:a.scale+b.scale},scale=Math.max(product.scale,target.scale,limit.scale);
 const difference=product.coefficient*10n**BigInt(scale-product.scale)-target.coefficient*10n**BigInt(scale-target.scale);
 return (difference<0n?-difference:difference)<=limit.coefficient*10n**BigInt(scale-limit.scale);
}
export function currencyTolerance(currency:unknown){
 try{const places=new Intl.NumberFormat('en',{style:'currency',currency:String(currency)}).resolvedOptions().maximumFractionDigits;if(places===0)return '1';if(places&&places<=4)return `0.${'0'.repeat(places-1)}1`;}catch{/* Invalid currency is a separate blocking field issue. */}
 return '0.01';
}
