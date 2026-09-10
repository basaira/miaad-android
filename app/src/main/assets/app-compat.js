/* WebView 69 compatibility shims. This file must load before all Miaad scripts. */
if (typeof globalThis === 'undefined') {
 Object.defineProperty(window,'globalThis',{
  configurable:true,writable:true,value:window
 });
}

if (!Array.prototype.at) {
 Object.defineProperty(Array.prototype,'at',{
  configurable:true,writable:true,
  value:function(index){
   const length=this.length>>>0;
   let n=Number(index)||0;
   n=n<0?Math.ceil(n):Math.floor(n);
   if(n<0)n+=length;
   return n<0||n>=length?undefined:this[n];
  }
 });
}

if (!Object.fromEntries) {
 Object.defineProperty(Object,'fromEntries',{
  configurable:true,writable:true,
  value:function(iterable){
   if(iterable==null)throw new TypeError('Object.fromEntries requires an iterable');
   const result={};
   for(const entry of iterable){
    if(entry==null||(typeof entry!=='object'&&typeof entry!=='function'))throw new TypeError('Iterator value is not an entry object');
    Object.defineProperty(result,entry[0],{configurable:true,enumerable:true,writable:true,value:entry[1]});
   }
   return result;
  }
 });
}

if (!String.prototype.replaceAll) {
 Object.defineProperty(String.prototype,'replaceAll',{
  configurable:true,writable:true,
  value:function(search,replacement){
   const source=String(this);
   if(search instanceof RegExp){
    if(!search.global)throw new TypeError('replaceAll RegExp must have global flag');
    return source.replace(search,replacement);
   }
   const needle=String(search).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   return source.replace(new RegExp(needle,'g'),replacement);
  }
 });
}
