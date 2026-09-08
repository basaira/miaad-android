/* Android 12's initial WebView predates Array.prototype.at. Load before core. */
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
