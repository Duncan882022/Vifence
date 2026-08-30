import{eh as U,du as E,g as N,b2 as y,dm as S,e0 as G,m as M,e as A,de as C,bM as J,co as T,r as V,v as I,ei as $,c3 as W,c as X,i2 as H,dx as Z,bQ as j}from"./graph_model-DukJrCqX.js";import"./index-C8l4PVAq.js";/**
 * @license
 * Copyright 2023 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *//*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */function R(e,o,r,i){function n(t){return t instanceof r?t:new r(function(l){l(t)})}return new(r||(r=Promise))(function(t,l){function d(s){try{a(i.next(s))}catch(h){l(h)}}function f(s){try{a(i.throw(s))}catch(h){l(h)}}function a(s){s.done?t(s.value):n(s.value).then(d,f)}a((i=i.apply(e,[])).next())})}function P(e,o){var r={label:0,sent:function(){if(t[0]&1)throw t[1];return t[1]},trys:[],ops:[]},i,n,t,l;return l={next:d(0),throw:d(1),return:d(2)},typeof Symbol=="function"&&(l[Symbol.iterator]=function(){return this}),l;function d(a){return function(s){return f([a,s])}}function f(a){if(i)throw new TypeError("Generator is already executing.");for(;r;)try{if(i=1,n&&(t=a[0]&2?n.return:a[0]?n.throw||((t=n.return)&&t.call(n),0):n.next)&&!(t=t.call(n,a[1])).done)return t;switch(n=0,t&&(a=[a[0]&2,t.value]),a[0]){case 0:case 1:t=a;break;case 4:return r.label++,{value:a[1],done:!1};case 5:r.label++,n=a[1],a=[0];continue;case 7:a=r.ops.pop(),r.trys.pop();continue;default:if(t=r.trys,!(t=t.length>0&&t[t.length-1])&&(a[0]===6||a[0]===2)){r=0;continue}if(a[0]===3&&(!t||a[1]>t[0]&&a[1]<t[3])){r.label=a[1];break}if(a[0]===6&&r.label<t[1]){r.label=t[1],t=a;break}if(t&&r.label<t[2]){r.label=t[2],r.ops.push(a);break}t[2]&&r.ops.pop(),r.trys.pop();continue}a=o.call(e,r)}catch(s){a=[6,s],n=0}finally{i=t=0}if(a[0]&5)throw a[1];return{value:a[0]?a[1]:void 0,done:!0}}}/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var Y=function(e){e.startEndTensor.dispose(),e.startPoint.dispose(),e.endPoint.dispose()},O=function(e){return{startEndTensor:e,startPoint:y(e,[0,0],[-1,2]),endPoint:y(e,[0,2],[-1,2])}},rr=function(e,o){var r=M(e.startPoint,o),i=M(e.endPoint,o),n=Z([r,i],1);return O(n)};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var tr={strides:[8,16],anchors:[2,6]},q=6;function er(e,o,r){for(var i=[],n=0;n<r.strides.length;n++)for(var t=r.strides[n],l=Math.floor((o+t-1)/t),d=Math.floor((e+t-1)/t),f=r.anchors[n],a=0;a<l;a++)for(var s=t*(a+.5),h=0;h<d;h++)for(var p=t*(h+.5),c=0;c<f;c++)i.push([p,s]);return i}function ar(e,o,r){var i=y(e,[0,1],[-1,2]),n=I(i,o),t=y(e,[0,3],[-1,2]),l=N(t,r),d=N(n,r),f=N(l,2),a=A(d,f),s=I(d,f),h=M(a,r),p=M(s,r),c=1;return Z([h,p],c)}function nr(e){return e instanceof T?[e.shape[0],e.shape[1]]:[e.height,e.width]}function K(e,o){var r,i,n;if(e.topLeft instanceof T&&e.bottomRight instanceof T){var t=S(function(){return[j([y(A(o-1,e.topLeft),0,1),y(e.topLeft,1,1)]),j([A(o-1,y(e.bottomRight,0,1)),y(e.bottomRight,1,1)])]}),l=t[0],d=t[1];r=l,i=d,e.landmarks!=null&&(n=S(function(){var u=A(E([o-1,0]),e.landmarks),x=E([1,-1]),F=M(u,x);return F}))}else{var f=e.topLeft,a=f[0],s=f[1],h=e.bottomRight,p=h[0],c=h[1];r=[o-1-a,s],i=[o-1-p,c],e.landmarks!=null&&(n=e.landmarks.map(function(u){return[o-1-u[0],u[1]]}))}var v={topLeft:r,bottomRight:i};return n!=null&&(v.landmarks=n),e.probability!=null&&(v.probability=e.probability instanceof T?e.probability.clone():e.probability),v}function Q(e,o){return S(function(){var r;return e.hasOwnProperty("box")?r=e.box:r=e,C(rr(r,o).startEndTensor)})}var or=(function(){function e(o,r,i,n,t,l){this.blazeFaceModel=o,this.width=r,this.height=i,this.maxFaces=n,this.anchorsData=er(r,i,tr),this.anchors=U(this.anchorsData),this.inputSizeData=[r,i],this.inputSize=E([r,i]),this.iouThreshold=t,this.scoreThreshold=l}return e.prototype.getBoundingBoxes=function(o,r,i){return i===void 0&&(i=!0),R(this,void 0,void 0,function(){var n,t,l,d,f,a,s,h,p,c,v,u,x,F,b=this;return P(this,function(g){switch(g.label){case 0:return n=S(function(){var m=G.resizeBilinear(o,[b.width,b.height]),w=M(A(N(m,255),.5),2),z=b.blazeFaceModel.predict(w),k=C(z),B=ar(k,b.anchors,b.inputSize),D=y(k,[0,0],[-1,1]),L=C(J(D));return[k,B,L]}),t=n[0],l=n[1],d=n[2],f=console.warn,console.warn=function(){},a=G.nonMaxSuppression(l,d,this.maxFaces,this.iouThreshold,this.scoreThreshold),console.warn=f,[4,a.array()];case 1:return s=g.sent(),a.dispose(),h=s.map(function(m){return y(l,[m,0],[1,-1])}),r?[3,3]:[4,Promise.all(h.map(function(m){return R(b,void 0,void 0,function(){var w;return P(this,function(z){switch(z.label){case 0:return[4,m.array()];case 1:return w=z.sent(),m.dispose(),[2,w]}})})}))];case 2:h=g.sent(),g.label=3;case 3:for(p=o.shape[1],c=o.shape[2],r?v=N([c,p],this.inputSize):v=[c/this.inputSizeData[0],p/this.inputSizeData[1]],u=[],x=function(m){var w=h[m],z=S(function(){var k=w instanceof T?O(w):O(U(w));if(!i)return k;var B=s[m],D;r?D=y(b.anchors,[B,0],[1,2]):D=b.anchorsData[B];var L=V(C(y(t,[B,q-1],[1,-1])),[q,-1]),_=y(d,[B],[1]);return{box:k,landmarks:L,probability:_,anchor:D}});u.push(z)},F=0;F<h.length;F++)x(F);return l.dispose(),d.dispose(),t.dispose(),[2,{boxes:u,scaleFactor:v}]}})})},e.prototype.estimateFaces=function(o,r,i,n){return r===void 0&&(r=!1),i===void 0&&(i=!1),n===void 0&&(n=!0),R(this,void 0,void 0,function(){var t,l,d,f,a,s,h=this;return P(this,function(p){switch(p.label){case 0:return t=nr(o),l=t[1],d=S(function(){return o instanceof T||(o=$(o)),W(X(o,"float32"),0)}),[4,this.getBoundingBoxes(d,r,n)];case 1:return f=p.sent(),a=f.boxes,s=f.scaleFactor,d.dispose(),r?[2,a.map(function(c){var v=Q(c,s),u={topLeft:y(v,[0],[2]),bottomRight:y(v,[2],[2])};if(n){var x=c,F=x.landmarks,b=x.probability,g=x.anchor,m=M(I(F,g),s);u.landmarks=m,u.probability=b}return i&&(u=K(u,l)),u})]:[2,Promise.all(a.map(function(c){return R(h,void 0,void 0,function(){var v,u,b,x,F,b,g,m,w,z,k,B,D=this;return P(this,function(L){switch(L.label){case 0:return v=Q(c,s),n?[3,2]:[4,v.array()];case 1:return b=L.sent(),u={topLeft:b.slice(0,2),bottomRight:b.slice(2)},[3,4];case 2:return[4,Promise.all([c.landmarks,v,c.probability].map(function(_){return R(D,void 0,void 0,function(){return P(this,function(sr){return[2,_.array()]})})}))];case 3:x=L.sent(),F=x[0],b=x[1],g=x[2],m=c.anchor,w=s,z=w[0],k=w[1],B=F.map(function(_){return[(_[0]+m[0])*z,(_[1]+m[1])*k]}),u={topLeft:b.slice(0,2),bottomRight:b.slice(2),landmarks:B,probability:g},Y(c.box),c.landmarks.dispose(),c.probability.dispose(),L.label=4;case 4:return v.dispose(),i&&(u=K(u,l)),[2,u]}})})}))]}})})},e.prototype.dispose=function(){this.blazeFaceModel.dispose(),this.anchors.dispose(),this.inputSize.dispose()},e})();/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var ir="https://tfhub.dev/tensorflow/tfjs-model/blazeface/1/default/1";function ur(e){var o=e===void 0?{}:e,r=o.maxFaces,i=r===void 0?10:r,n=o.inputWidth,t=n===void 0?128:n,l=o.inputHeight,d=l===void 0?128:l,f=o.iouThreshold,a=f===void 0?.3:f,s=o.scoreThreshold,h=s===void 0?.75:s,p=o.modelUrl;return R(this,void 0,void 0,function(){var c,v;return P(this,function(u){switch(u.label){case 0:return p==null?[3,2]:[4,H(p)];case 1:return c=u.sent(),[3,4];case 2:return[4,H(ir,{fromTFHub:!0})];case 3:c=u.sent(),u.label=4;case 4:return v=new or(c,t,d,i,a,h),[2,v]}})})}export{or as BlazeFaceModel,ur as load};
