/** Orthographic projection keeps the city inside the uncovered area of the canvas. */
export function planningFrame(width,height,size,zoom,insets){
  const left=Math.max(0,insets?.left||0),right=Math.max(0,insets?.right||0),top=Math.max(0,insets?.top||0),bottom=Math.max(0,insets?.bottom||0);
  const usableWidth=Math.max(1,width-left-right),usableHeight=Math.max(1,height-top-bottom),aspect=width/height;
  const localSpan=Math.max(size*.64+2.8,size*.81/(usableWidth/usableHeight))/zoom,span=localSpan*height/usableHeight;
  const centerX=left+usableWidth/2,centerY=top+usableHeight/2,offsetX=(width/2-centerX)*2*span/height,offsetY=(centerY-height/2)*2*span/height;
  return {left:-span*aspect+offsetX,right:span*aspect+offsetX,top:span+offsetY,bottom:-span+offsetY,usable:{left,top,width:usableWidth,height:usableHeight}};
}
