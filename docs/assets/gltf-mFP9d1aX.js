import{V as g,M as R,S as J,D as me,a as fe,B as we,b as he,c as _e,W as ve,A as be,P as Se,d as Ae,H as ye,E as Le,e as Ee,f as xe,g as Ce,h as Me,p as de,G as De,i as Ie,R as Oe}from"./stats.module-BaWFIdRz.js";import{M as Pe,K as $e}from"./KTX2Loader-DpeHDtow.js";const G=new R;class F{constructor(e){e=e||{},this.zNear=e.webGL===!0?-1:0,this.vertices={near:[new g,new g,new g,new g],far:[new g,new g,new g,new g]},e.projectionMatrix!==void 0&&this.setFromProjectionMatrix(e.projectionMatrix,e.maxFar||1e4)}setFromProjectionMatrix(e,t){const i=this.zNear,r=e.elements[11]===0;return G.copy(e).invert(),this.vertices.near[0].set(1,1,i),this.vertices.near[1].set(1,-1,i),this.vertices.near[2].set(-1,-1,i),this.vertices.near[3].set(-1,1,i),this.vertices.near.forEach(function(a){a.applyMatrix4(G)}),this.vertices.far[0].set(1,1,1),this.vertices.far[1].set(1,-1,1),this.vertices.far[2].set(-1,-1,1),this.vertices.far[3].set(-1,1,1),this.vertices.far.forEach(function(a){a.applyMatrix4(G);const o=Math.abs(a.z);r?a.z*=Math.min(t/o,1):a.multiplyScalar(Math.min(t/o,1))}),this.vertices}split(e,t){for(;e.length>t.length;)t.push(new F);t.length=e.length;for(let i=0;i<e.length;i++){const r=t[i];if(i===0)for(let a=0;a<4;a++)r.vertices.near[a].copy(this.vertices.near[a]);else for(let a=0;a<4;a++)r.vertices.near[a].lerpVectors(this.vertices.near[a],this.vertices.far[a],e[i-1]);if(i===e.length-1)for(let a=0;a<4;a++)r.vertices.far[a].copy(this.vertices.far[a]);else for(let a=0;a<4;a++)r.vertices.far[a].lerpVectors(this.vertices.near[a],this.vertices.far[a],e[i])}}toSpace(e,t){for(let i=0;i<4;i++)t.vertices.near[i].copy(this.vertices.near[i]).applyMatrix4(e),t.vertices.far[i].copy(this.vertices.far[i]).applyMatrix4(e)}}const se={lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );

vec3 geometryClearcoatNormal = vec3( 0.0 );

#ifdef USE_CLEARCOAT

	geometryClearcoatNormal = clearcoatNormal;

#endif

#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		// Iridescence F0 approximation
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif

IncidentLight directLight;

#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		pointLight = pointLights[ i ];

		getPointLightInfo( pointLight, geometryPosition, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;

		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )

	SpotLight spotLight;
 	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;

	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

		spotLight = spotLights[ i ];

		getSpotLightInfo( spotLight, geometryPosition, directLight );

  		// spot lights are ordered [shadows with maps, shadows without maps, maps without shadows, none]
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;

		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && defined( USE_CSM ) && defined( CSM_CASCADES )

	DirectionalLight directionalLight;
	float linearDepth = (vViewPosition.z) / (shadowFar - cameraNear);
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#if defined( USE_SHADOWMAP ) && defined( CSM_FADE )
		vec2 cascade;
		float cascadeCenter;
		float closestEdge;
		float margin;
		float csmx;
		float csmy;

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );

			#if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
				// NOTE: Depth gets larger away from the camera.
				// cascade.x is closer, cascade.y is further
				cascade = CSM_cascades[ i ];
				cascadeCenter = ( cascade.x + cascade.y ) / 2.0;
				closestEdge = linearDepth < cascadeCenter ? cascade.x : cascade.y;
				margin = 0.25 * pow( closestEdge, 2.0 );
				csmx = cascade.x - margin / 2.0;
				csmy = cascade.y + margin / 2.0;
				if( linearDepth >= csmx && ( linearDepth < csmy || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 ) ) {

					float dist = min( linearDepth - csmx, csmy - linearDepth );
					float ratio = clamp( dist / margin, 0.0, 1.0 );

					vec3 prevColor = directLight.color;
					directionalLightShadow = directionalLightShadows[ i ];
					directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;

					bool shouldFadeLastCascade = UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 && linearDepth > cascadeCenter;
					directLight.color = mix( prevColor, directLight.color, shouldFadeLastCascade ? ratio : 1.0 );

					ReflectedLight prevLight = reflectedLight;
					RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

					bool shouldBlend = UNROLLED_LOOP_INDEX != CSM_CASCADES - 1 || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 && linearDepth < cascadeCenter;
					float blendRatio = shouldBlend ? ratio : 1.0;

					reflectedLight.directDiffuse = mix( prevLight.directDiffuse, reflectedLight.directDiffuse, blendRatio );
					reflectedLight.directSpecular = mix( prevLight.directSpecular, reflectedLight.directSpecular, blendRatio );
					reflectedLight.indirectDiffuse = mix( prevLight.indirectDiffuse, reflectedLight.indirectDiffuse, blendRatio );
					reflectedLight.indirectSpecular = mix( prevLight.indirectSpecular, reflectedLight.indirectSpecular, blendRatio );

				}
			#endif

		}
		#pragma unroll_loop_end
	#elif defined (USE_SHADOWMAP)

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );

			#if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )

				directionalLightShadow = directionalLightShadows[ i ];
				if(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y) directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;

				if(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && (linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1)) RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

			#endif

		}
		#pragma unroll_loop_end

	#elif ( NUM_DIR_LIGHT_SHADOWS > 0 )
		// note: no loop here - all CSM lights are in fact one light only
		getDirectionalLightInfo( directionalLights[0], directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	#endif

	#if ( NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS)
		// compute the lights not casting shadows (if any)

		#pragma unroll_loop_start
		for ( int i = NUM_DIR_LIGHT_SHADOWS; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];

			getDirectionalLightInfo( directionalLight, directLight );

			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		}
		#pragma unroll_loop_end

	#endif

#endif


#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM ) && !defined( CSM_CASCADES )

	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];

		getDirectionalLightInfo( directionalLight, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )

	RectAreaLight rectAreaLight;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {

		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if defined( RE_IndirectDiffuse )

	vec3 iblIrradiance = vec3( 0.0 );

	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );

	#if defined( USE_LIGHT_PROBES )

		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );

	#endif

	#if ( NUM_HEMI_LIGHTS > 0 )

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {

			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );

		}
		#pragma unroll_loop_end

	#endif

#endif

#if defined( RE_IndirectSpecular )

	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );

#endif
`,lights_pars_begin:`
#if defined( USE_CSM ) && defined( CSM_CASCADES )
uniform vec2 CSM_cascades[CSM_CASCADES];
uniform float cameraNear;
uniform float shadowFar;
#endif
	`+J.lights_pars_begin},ae=new R,B=new F({webGL:!0}),y=new g,Ne=new g,P=new we,j=[],W=[],X=new R,re=new R,ke=new g(0,1,0);class He{constructor(e){this.camera=e.camera,this.parent=e.parent,this.cascades=e.cascades||3,this.maxFar=e.maxFar||1e5,this.mode=e.mode||"practical",this.shadowMapSize=e.shadowMapSize||2048,this.shadowBias=e.shadowBias||1e-6,this.lightDirection=e.lightDirection||new g(1,-1,1).normalize(),this.lightIntensity=e.lightIntensity||3,this.lightNear=e.lightNear||1,this.lightFar=e.lightFar||2e3,this.lightMargin=e.lightMargin||200,this.customSplitsCallback=e.customSplitsCallback,this.fade=!1,this.mainFrustum=new F({webGL:!0}),this.frustums=[],this.breaks=[],this.lights=[],this.shaders=new Map,this._createLights(),this.updateFrustums(),this._injectInclude()}_createLights(){for(let e=0;e<this.cascades;e++){const t=new me(16777215,this.lightIntensity);t.castShadow=!0,t.shadow.mapSize.width=this.shadowMapSize,t.shadow.mapSize.height=this.shadowMapSize,t.shadow.camera.near=this.lightNear,t.shadow.camera.far=this.lightFar,t.shadow.bias=this.shadowBias,this.parent.add(t),this.parent.add(t.target),this.lights.push(t)}}_initCascades(){const e=this.camera;e.updateProjectionMatrix(),this.mainFrustum.setFromProjectionMatrix(e.projectionMatrix,this.maxFar),this.mainFrustum.split(this.breaks,this.frustums)}_updateShadowBounds(){const e=this.frustums;for(let t=0;t<e.length;t++){const r=this.lights[t].shadow.camera,a=this.frustums[t],o=a.vertices.near,n=a.vertices.far,l=n[0];let c;l.distanceTo(n[2])>l.distanceTo(o[2])?c=n[2]:c=o[2];let h=l.distanceTo(c);if(this.fade){const u=this.camera,p=Math.max(u.far,this.maxFar),E=a.vertices.far[0].z/(p-u.near),O=.25*Math.pow(E,2)*(p-u.near);h+=O}r.left=-h/2,r.right=h/2,r.top=h/2,r.bottom=-h/2,r.updateProjectionMatrix()}}_getBreaks(){const e=this.camera,t=Math.min(e.far,this.maxFar);switch(this.breaks.length=0,this.mode){case"uniform":i(this.cascades,e.near,t,this.breaks);break;case"logarithmic":r(this.cascades,e.near,t,this.breaks);break;case"practical":a(this.cascades,e.near,t,.5,this.breaks);break;case"custom":this.customSplitsCallback===void 0&&console.error("CSM: Custom split scheme callback not defined."),this.customSplitsCallback(this.cascades,e.near,t,this.breaks);break}function i(o,n,l,c){for(let h=1;h<o;h++)c.push((n+(l-n)*h/o)/l);c.push(1)}function r(o,n,l,c){for(let h=1;h<o;h++)c.push(n*(l/n)**(h/o)/l);c.push(1)}function a(o,n,l,c,h){j.length=0,W.length=0,r(o,n,l,W),i(o,n,l,j);for(let u=1;u<o;u++)h.push(fe.lerp(j[u-1],W[u-1],c));h.push(1)}}update(){const e=this.camera,t=this.frustums;X.lookAt(Ne,this.lightDirection,ke),re.copy(X).invert();for(let i=0;i<t.length;i++){const r=this.lights[i],a=r.shadow.camera,o=(a.right-a.left)/this.shadowMapSize,n=(a.top-a.bottom)/this.shadowMapSize;ae.multiplyMatrices(re,e.matrixWorld),t[i].toSpace(ae,B);const l=B.vertices.near,c=B.vertices.far;P.makeEmpty();for(let h=0;h<4;h++)P.expandByPoint(l[h]),P.expandByPoint(c[h]);P.getCenter(y),y.z=P.max.z+this.lightMargin,y.x=Math.floor(y.x/o)*o,y.y=Math.floor(y.y/n)*n,y.applyMatrix4(X),r.position.copy(y),r.target.position.copy(y),r.target.position.x+=this.lightDirection.x,r.target.position.y+=this.lightDirection.y,r.target.position.z+=this.lightDirection.z}}_injectInclude(){J.lights_fragment_begin=se.lights_fragment_begin,J.lights_pars_begin=se.lights_pars_begin}setupMaterial(e){e.defines=e.defines||{},e.defines.USE_CSM=1,e.defines.CSM_CASCADES=this.cascades,this.fade&&(e.defines.CSM_FADE="");const t=[],i=this,r=this.shaders;e.onBeforeCompile=function(a){const o=Math.min(i.camera.far,i.maxFar);i._getExtendedBreaks(t),a.uniforms.CSM_cascades={value:t},a.uniforms.cameraNear={value:i.camera.near},a.uniforms.shadowFar={value:o},r.set(e,a)},r.set(e,null)}_updateUniforms(){const e=Math.min(this.camera.far,this.maxFar);this.shaders.forEach(function(i,r){if(i!==null){const a=i.uniforms;this._getExtendedBreaks(a.CSM_cascades.value),a.cameraNear.value=this.camera.near,a.shadowFar.value=e}!this.fade&&"CSM_FADE"in r.defines?(delete r.defines.CSM_FADE,r.needsUpdate=!0):this.fade&&!("CSM_FADE"in r.defines)&&(r.defines.CSM_FADE="",r.needsUpdate=!0)},this)}_getExtendedBreaks(e){for(;e.length<this.breaks.length;)e.push(new he);e.length=this.breaks.length;for(let t=0;t<this.cascades;t++){const i=this.breaks[t],r=this.breaks[t-1]||0;e[t].x=r,e[t].y=i}}updateFrustums(){this._getBreaks(),this._initCascades(),this._updateShadowBounds(),this._updateUniforms()}remove(){for(let e=0;e<this.lights.length;e++)this.parent.remove(this.lights[e].target),this.parent.remove(this.lights[e])}dispose(){const e=this.shaders;e.forEach(function(t,i){delete i.onBeforeCompile,delete i.defines.USE_CSM,delete i.defines.CSM_CASCADES,delete i.defines.CSM_FADE,t!==null&&(delete t.uniforms.CSM_cascades,delete t.uniforms.cameraNear,delete t.uniforms.shadowFar),i.needsUpdate=!0}),e.clear()}}class A{constructor(e,t,i,r,a="div"){this.parent=e,this.object=t,this.property=i,this._disabled=!1,this._hidden=!1,this.initialValue=this.getValue(),this.domElement=document.createElement("div"),this.domElement.classList.add("controller"),this.domElement.classList.add(r),this.$name=document.createElement("div"),this.$name.classList.add("name"),A.nextNameID=A.nextNameID||0,this.$name.id="lil-gui-name-"+ ++A.nextNameID,this.$widget=document.createElement(a),this.$widget.classList.add("widget"),this.$disable=this.$widget,this.domElement.appendChild(this.$name),this.domElement.appendChild(this.$widget),this.parent.children.push(this),this.parent.controllers.push(this),this.parent.$children.appendChild(this.domElement),this._listenCallback=this._listenCallback.bind(this),this.name(i)}name(e){return this._name=e,this.$name.innerHTML=e,this}onChange(e){return this._onChange=e,this}_callOnChange(){this.parent._callOnChange(this),this._onChange!==void 0&&this._onChange.call(this,this.getValue()),this._changed=!0}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(){this._changed&&(this.parent._callOnFinishChange(this),this._onFinishChange!==void 0&&this._onFinishChange.call(this,this.getValue())),this._changed=!1}reset(){return this.setValue(this.initialValue),this._callOnFinishChange(),this}enable(e=!0){return this.disable(!e)}disable(e=!0){return e===this._disabled||(this._disabled=e,this.domElement.classList.toggle("disabled",e),this.$disable.toggleAttribute("disabled",e)),this}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}options(e){const t=this.parent.add(this.object,this.property,e);return t.name(this._name),this.destroy(),t}min(e){return this}max(e){return this}step(e){return this}decimals(e){return this}listen(e=!0){return this._listening=e,this._listenCallbackID!==void 0&&(cancelAnimationFrame(this._listenCallbackID),this._listenCallbackID=void 0),this._listening&&this._listenCallback(),this}_listenCallback(){this._listenCallbackID=requestAnimationFrame(this._listenCallback);const e=this.save();e!==this._listenPrevValue&&this.updateDisplay(),this._listenPrevValue=e}getValue(){return this.object[this.property]}setValue(e){return this.object[this.property]=e,this._callOnChange(),this.updateDisplay(),this}updateDisplay(){return this}load(e){return this.setValue(e),this._callOnFinishChange(),this}save(){return this.getValue()}destroy(){this.listen(!1),this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.controllers.splice(this.parent.controllers.indexOf(this),1),this.parent.$children.removeChild(this.domElement)}}class Re extends A{constructor(e,t,i){super(e,t,i,"boolean","label"),this.$input=document.createElement("input"),this.$input.setAttribute("type","checkbox"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$widget.appendChild(this.$input),this.$input.addEventListener("change",()=>{this.setValue(this.$input.checked),this._callOnFinishChange()}),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.checked=this.getValue(),this}}function K(s){let e,t;return(e=s.match(/(#|0x)?([a-f0-9]{6})/i))?t=e[2]:(e=s.match(/rgb\(\s*(\d*)\s*,\s*(\d*)\s*,\s*(\d*)\s*\)/))?t=parseInt(e[1]).toString(16).padStart(2,0)+parseInt(e[2]).toString(16).padStart(2,0)+parseInt(e[3]).toString(16).padStart(2,0):(e=s.match(/^#?([a-f0-9])([a-f0-9])([a-f0-9])$/i))&&(t=e[1]+e[1]+e[2]+e[2]+e[3]+e[3]),!!t&&"#"+t}const Fe={isPrimitive:!0,match:s=>typeof s=="string",fromHexString:K,toHexString:K},k={isPrimitive:!0,match:s=>typeof s=="number",fromHexString:s=>parseInt(s.substring(1),16),toHexString:s=>"#"+s.toString(16).padStart(6,0)},Te={isPrimitive:!1,match:Array.isArray,fromHexString(s,e,t=1){const i=k.fromHexString(s);e[0]=(i>>16&255)/255*t,e[1]=(i>>8&255)/255*t,e[2]=(255&i)/255*t},toHexString:([s,e,t],i=1)=>k.toHexString(s*(i=255/i)<<16^e*i<<8^t*i<<0)},Ve={isPrimitive:!1,match:s=>Object(s)===s,fromHexString(s,e,t=1){const i=k.fromHexString(s);e.r=(i>>16&255)/255*t,e.g=(i>>8&255)/255*t,e.b=(255&i)/255*t},toHexString:({r:s,g:e,b:t},i=1)=>k.toHexString(s*(i=255/i)<<16^e*i<<8^t*i<<0)},Ue=[Fe,k,Te,Ve];class ze extends A{constructor(e,t,i,r){var a;super(e,t,i,"color"),this.$input=document.createElement("input"),this.$input.setAttribute("type","color"),this.$input.setAttribute("tabindex",-1),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$text=document.createElement("input"),this.$text.setAttribute("type","text"),this.$text.setAttribute("spellcheck","false"),this.$text.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("display"),this.$display.appendChild(this.$input),this.$widget.appendChild(this.$display),this.$widget.appendChild(this.$text),this._format=(a=this.initialValue,Ue.find(o=>o.match(a))),this._rgbScale=r,this._initialValueHexString=this.save(),this._textFocused=!1,this.$input.addEventListener("input",()=>{this._setValueFromHexString(this.$input.value)}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$text.addEventListener("input",()=>{const o=K(this.$text.value);o&&this._setValueFromHexString(o)}),this.$text.addEventListener("focus",()=>{this._textFocused=!0,this.$text.select()}),this.$text.addEventListener("blur",()=>{this._textFocused=!1,this.updateDisplay(),this._callOnFinishChange()}),this.$disable=this.$text,this.updateDisplay()}reset(){return this._setValueFromHexString(this._initialValueHexString),this}_setValueFromHexString(e){if(this._format.isPrimitive){const t=this._format.fromHexString(e);this.setValue(t)}else this._format.fromHexString(e,this.getValue(),this._rgbScale),this._callOnChange(),this.updateDisplay()}save(){return this._format.toHexString(this.getValue(),this._rgbScale)}load(e){return this._setValueFromHexString(e),this._callOnFinishChange(),this}updateDisplay(){return this.$input.value=this._format.toHexString(this.getValue(),this._rgbScale),this._textFocused||(this.$text.value=this.$input.value.substring(1)),this.$display.style.backgroundColor=this.$input.value,this}}class Y extends A{constructor(e,t,i){super(e,t,i,"function"),this.$button=document.createElement("button"),this.$button.appendChild(this.$name),this.$widget.appendChild(this.$button),this.$button.addEventListener("click",r=>{r.preventDefault(),this.getValue().call(this.object)}),this.$button.addEventListener("touchstart",()=>{},{passive:!0}),this.$disable=this.$button}}class Ge extends A{constructor(e,t,i,r,a,o){super(e,t,i,"number"),this._initInput(),this.min(r),this.max(a);const n=o!==void 0;this.step(n?o:this._getImplicitStep(),n),this.updateDisplay()}decimals(e){return this._decimals=e,this.updateDisplay(),this}min(e){return this._min=e,this._onUpdateMinMax(),this}max(e){return this._max=e,this._onUpdateMinMax(),this}step(e,t=!0){return this._step=e,this._stepExplicit=t,this}updateDisplay(){const e=this.getValue();if(this._hasSlider){let t=(e-this._min)/(this._max-this._min);t=Math.max(0,Math.min(t,1)),this.$fill.style.width=100*t+"%"}return this._inputFocused||(this.$input.value=this._decimals===void 0?e:e.toFixed(this._decimals)),this}_initInput(){this.$input=document.createElement("input"),this.$input.setAttribute("type","number"),this.$input.setAttribute("step","any"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$widget.appendChild(this.$input),this.$disable=this.$input;const e=h=>{const u=parseFloat(this.$input.value);isNaN(u)||(this._snapClampSetValue(u+h),this.$input.value=this.getValue())};let t,i,r,a,o,n=!1;const l=h=>{if(n){const u=h.clientX-t,p=h.clientY-i;Math.abs(p)>5?(h.preventDefault(),this.$input.blur(),n=!1,this._setDraggingStyle(!0,"vertical")):Math.abs(u)>5&&c()}if(!n){const u=h.clientY-r;o-=u*this._step*this._arrowKeyMultiplier(h),a+o>this._max?o=this._max-a:a+o<this._min&&(o=this._min-a),this._snapClampSetValue(a+o)}r=h.clientY},c=()=>{this._setDraggingStyle(!1,"vertical"),this._callOnFinishChange(),window.removeEventListener("mousemove",l),window.removeEventListener("mouseup",c)};this.$input.addEventListener("input",()=>{let h=parseFloat(this.$input.value);isNaN(h)||(this._stepExplicit&&(h=this._snap(h)),this.setValue(this._clamp(h)))}),this.$input.addEventListener("keydown",h=>{h.code==="Enter"&&this.$input.blur(),h.code==="ArrowUp"&&(h.preventDefault(),e(this._step*this._arrowKeyMultiplier(h))),h.code==="ArrowDown"&&(h.preventDefault(),e(this._step*this._arrowKeyMultiplier(h)*-1))}),this.$input.addEventListener("wheel",h=>{this._inputFocused&&(h.preventDefault(),e(this._step*this._normalizeMouseWheel(h)))},{passive:!1}),this.$input.addEventListener("mousedown",h=>{t=h.clientX,i=r=h.clientY,n=!0,a=this.getValue(),o=0,window.addEventListener("mousemove",l),window.addEventListener("mouseup",c)}),this.$input.addEventListener("focus",()=>{this._inputFocused=!0}),this.$input.addEventListener("blur",()=>{this._inputFocused=!1,this.updateDisplay(),this._callOnFinishChange()})}_initSlider(){this._hasSlider=!0,this.$slider=document.createElement("div"),this.$slider.classList.add("slider"),this.$fill=document.createElement("div"),this.$fill.classList.add("fill"),this.$slider.appendChild(this.$fill),this.$widget.insertBefore(this.$slider,this.$input),this.domElement.classList.add("hasSlider");const e=p=>{const E=this.$slider.getBoundingClientRect();let O=(ee=p,U=E.left,te=E.right,z=this._min,ie=this._max,(ee-U)/(te-U)*(ie-z)+z);var ee,U,te,z,ie;this._snapClampSetValue(O)},t=p=>{e(p.clientX)},i=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("mousemove",t),window.removeEventListener("mouseup",i)};let r,a,o=!1;const n=p=>{p.preventDefault(),this._setDraggingStyle(!0),e(p.touches[0].clientX),o=!1},l=p=>{if(o){const E=p.touches[0].clientX-r,O=p.touches[0].clientY-a;Math.abs(E)>Math.abs(O)?n(p):(window.removeEventListener("touchmove",l),window.removeEventListener("touchend",c))}else p.preventDefault(),e(p.touches[0].clientX)},c=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("touchmove",l),window.removeEventListener("touchend",c)},h=this._callOnFinishChange.bind(this);let u;this.$slider.addEventListener("mousedown",p=>{this._setDraggingStyle(!0),e(p.clientX),window.addEventListener("mousemove",t),window.addEventListener("mouseup",i)}),this.$slider.addEventListener("touchstart",p=>{p.touches.length>1||(this._hasScrollBar?(r=p.touches[0].clientX,a=p.touches[0].clientY,o=!0):n(p),window.addEventListener("touchmove",l,{passive:!1}),window.addEventListener("touchend",c))},{passive:!1}),this.$slider.addEventListener("wheel",p=>{if(Math.abs(p.deltaX)<Math.abs(p.deltaY)&&this._hasScrollBar)return;p.preventDefault();const E=this._normalizeMouseWheel(p)*this._step;this._snapClampSetValue(this.getValue()+E),this.$input.value=this.getValue(),clearTimeout(u),u=setTimeout(h,400)},{passive:!1})}_setDraggingStyle(e,t="horizontal"){this.$slider&&this.$slider.classList.toggle("active",e),document.body.classList.toggle("lil-gui-dragging",e),document.body.classList.toggle("lil-gui-"+t,e)}_getImplicitStep(){return this._hasMin&&this._hasMax?(this._max-this._min)/1e3:.1}_onUpdateMinMax(){!this._hasSlider&&this._hasMin&&this._hasMax&&(this._stepExplicit||this.step(this._getImplicitStep(),!1),this._initSlider(),this.updateDisplay())}_normalizeMouseWheel(e){let{deltaX:t,deltaY:i}=e;return Math.floor(e.deltaY)!==e.deltaY&&e.wheelDelta&&(t=0,i=-e.wheelDelta/120,i*=this._stepExplicit?1:10),t+-i}_arrowKeyMultiplier(e){let t=this._stepExplicit?1:10;return e.shiftKey?t*=10:e.altKey&&(t/=10),t}_snap(e){const t=Math.round(e/this._step)*this._step;return parseFloat(t.toPrecision(15))}_clamp(e){return e<this._min&&(e=this._min),e>this._max&&(e=this._max),e}_snapClampSetValue(e){this.setValue(this._clamp(this._snap(e)))}get _hasScrollBar(){const e=this.parent.root.$children;return e.scrollHeight>e.clientHeight}get _hasMin(){return this._min!==void 0}get _hasMax(){return this._max!==void 0}}class Be extends A{constructor(e,t,i,r){super(e,t,i,"option"),this.$select=document.createElement("select"),this.$select.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("display"),this._values=Array.isArray(r)?r:Object.values(r),this._names=Array.isArray(r)?r:Object.keys(r),this._names.forEach(a=>{const o=document.createElement("option");o.innerHTML=a,this.$select.appendChild(o)}),this.$select.addEventListener("change",()=>{this.setValue(this._values[this.$select.selectedIndex]),this._callOnFinishChange()}),this.$select.addEventListener("focus",()=>{this.$display.classList.add("focus")}),this.$select.addEventListener("blur",()=>{this.$display.classList.remove("focus")}),this.$widget.appendChild(this.$select),this.$widget.appendChild(this.$display),this.$disable=this.$select,this.updateDisplay()}updateDisplay(){const e=this.getValue(),t=this._values.indexOf(e);return this.$select.selectedIndex=t,this.$display.innerHTML=t===-1?e:this._names[t],this}}class je extends A{constructor(e,t,i){super(e,t,i,"string"),this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$input.addEventListener("input",()=>{this.setValue(this.$input.value)}),this.$input.addEventListener("keydown",r=>{r.code==="Enter"&&this.$input.blur()}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$widget.appendChild(this.$input),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.value=this.getValue(),this}}let ne=!1;class q{constructor({parent:e,autoPlace:t=e===void 0,container:i,width:r,title:a="Controls",injectStyles:o=!0,touchStyles:n=!0}={}){if(this.parent=e,this.root=e?e.root:this,this.children=[],this.controllers=[],this.folders=[],this._closed=!1,this._hidden=!1,this.domElement=document.createElement("div"),this.domElement.classList.add("lil-gui"),this.$title=document.createElement("div"),this.$title.classList.add("title"),this.$title.setAttribute("role","button"),this.$title.setAttribute("aria-expanded",!0),this.$title.setAttribute("tabindex",0),this.$title.addEventListener("click",()=>this.openAnimated(this._closed)),this.$title.addEventListener("keydown",l=>{l.code!=="Enter"&&l.code!=="Space"||(l.preventDefault(),this.$title.click())}),this.$title.addEventListener("touchstart",()=>{},{passive:!0}),this.$children=document.createElement("div"),this.$children.classList.add("children"),this.domElement.appendChild(this.$title),this.domElement.appendChild(this.$children),this.title(a),n&&this.domElement.classList.add("allow-touch-styles"),this.parent)return this.parent.children.push(this),this.parent.folders.push(this),void this.parent.$children.appendChild(this.domElement);this.domElement.classList.add("root"),!ne&&o&&((function(l){const c=document.createElement("style");c.innerHTML=l;const h=document.querySelector("head link[rel=stylesheet], head style");h?document.head.insertBefore(c,h):document.head.appendChild(c)})('.lil-gui{--background-color:#1f1f1f;--text-color:#ebebeb;--title-background-color:#111;--title-text-color:#ebebeb;--widget-color:#424242;--hover-color:#4f4f4f;--focus-color:#595959;--number-color:#2cc9ff;--string-color:#a2db3c;--font-size:11px;--input-font-size:11px;--font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;--font-family-mono:Menlo,Monaco,Consolas,"Droid Sans Mono",monospace;--padding:4px;--spacing:4px;--widget-height:20px;--name-width:45%;--slider-knob-width:2px;--slider-input-width:27%;--color-input-width:27%;--slider-input-min-width:45px;--color-input-min-width:45px;--folder-indent:7px;--widget-padding:0 0 0 3px;--widget-border-radius:2px;--checkbox-size:calc(var(--widget-height)*0.75);--scrollbar-width:5px;background-color:var(--background-color);color:var(--text-color);font-family:var(--font-family);font-size:var(--font-size);font-style:normal;font-weight:400;line-height:1;text-align:left;touch-action:manipulation;user-select:none;-webkit-user-select:none}.lil-gui,.lil-gui *{box-sizing:border-box;margin:0;padding:0}.lil-gui.root{display:flex;flex-direction:column;width:var(--width,245px)}.lil-gui.root>.title{background:var(--title-background-color);color:var(--title-text-color)}.lil-gui.root>.children{overflow-x:hidden;overflow-y:auto}.lil-gui.root>.children::-webkit-scrollbar{background:var(--background-color);height:var(--scrollbar-width);width:var(--scrollbar-width)}.lil-gui.root>.children::-webkit-scrollbar-thumb{background:var(--focus-color);border-radius:var(--scrollbar-width)}.lil-gui.force-touch-styles{--widget-height:28px;--padding:6px;--spacing:6px;--font-size:13px;--input-font-size:16px;--folder-indent:10px;--scrollbar-width:7px;--slider-input-min-width:50px;--color-input-min-width:65px}.lil-gui.autoPlace{max-height:100%;position:fixed;right:15px;top:0;z-index:1001}.lil-gui .controller{align-items:center;display:flex;margin:var(--spacing) 0;padding:0 var(--padding)}.lil-gui .controller.disabled{opacity:.5}.lil-gui .controller.disabled,.lil-gui .controller.disabled *{pointer-events:none!important}.lil-gui .controller>.name{flex-shrink:0;line-height:var(--widget-height);min-width:var(--name-width);padding-right:var(--spacing);white-space:pre}.lil-gui .controller .widget{align-items:center;display:flex;min-height:var(--widget-height);position:relative;width:100%}.lil-gui .controller.string input{color:var(--string-color)}.lil-gui .controller.boolean .widget{cursor:pointer}.lil-gui .controller.color .display{border-radius:var(--widget-border-radius);height:var(--widget-height);position:relative;width:100%}.lil-gui .controller.color input[type=color]{cursor:pointer;height:100%;opacity:0;width:100%}.lil-gui .controller.color input[type=text]{flex-shrink:0;font-family:var(--font-family-mono);margin-left:var(--spacing);min-width:var(--color-input-min-width);width:var(--color-input-width)}.lil-gui .controller.option select{max-width:100%;opacity:0;position:absolute;width:100%}.lil-gui .controller.option .display{background:var(--widget-color);border-radius:var(--widget-border-radius);height:var(--widget-height);line-height:var(--widget-height);max-width:100%;overflow:hidden;padding-left:.55em;padding-right:1.75em;pointer-events:none;position:relative;word-break:break-all}.lil-gui .controller.option .display.active{background:var(--focus-color)}.lil-gui .controller.option .display:after{bottom:0;content:"↕";font-family:lil-gui;padding-right:.375em;position:absolute;right:0;top:0}.lil-gui .controller.option .widget,.lil-gui .controller.option select{cursor:pointer}.lil-gui .controller.number input{color:var(--number-color)}.lil-gui .controller.number.hasSlider input{flex-shrink:0;margin-left:var(--spacing);min-width:var(--slider-input-min-width);width:var(--slider-input-width)}.lil-gui .controller.number .slider{background-color:var(--widget-color);border-radius:var(--widget-border-radius);cursor:ew-resize;height:var(--widget-height);overflow:hidden;padding-right:var(--slider-knob-width);touch-action:pan-y;width:100%}.lil-gui .controller.number .slider.active{background-color:var(--focus-color)}.lil-gui .controller.number .slider.active .fill{opacity:.95}.lil-gui .controller.number .fill{border-right:var(--slider-knob-width) solid var(--number-color);box-sizing:content-box;height:100%}.lil-gui-dragging .lil-gui{--hover-color:var(--widget-color)}.lil-gui-dragging *{cursor:ew-resize!important}.lil-gui-dragging.lil-gui-vertical *{cursor:ns-resize!important}.lil-gui .title{--title-height:calc(var(--widget-height) + var(--spacing)*1.25);-webkit-tap-highlight-color:transparent;text-decoration-skip:objects;cursor:pointer;font-weight:600;height:var(--title-height);line-height:calc(var(--title-height) - 4px);outline:none;padding:0 var(--padding)}.lil-gui .title:before{content:"▾";display:inline-block;font-family:lil-gui;padding-right:2px}.lil-gui .title:active{background:var(--title-background-color);opacity:.75}.lil-gui.root>.title:focus{text-decoration:none!important}.lil-gui.closed>.title:before{content:"▸"}.lil-gui.closed>.children{opacity:0;transform:translateY(-7px)}.lil-gui.closed:not(.transition)>.children{display:none}.lil-gui.transition>.children{overflow:hidden;pointer-events:none;transition-duration:.3s;transition-property:height,opacity,transform;transition-timing-function:cubic-bezier(.2,.6,.35,1)}.lil-gui .children:empty:before{content:"Empty";display:block;font-style:italic;height:var(--widget-height);line-height:var(--widget-height);margin:var(--spacing) 0;opacity:.5;padding:0 var(--padding)}.lil-gui.root>.children>.lil-gui>.title{border-width:0;border-bottom:1px solid var(--widget-color);border-left:0 solid var(--widget-color);border-right:0 solid var(--widget-color);border-top:1px solid var(--widget-color);transition:border-color .3s}.lil-gui.root>.children>.lil-gui.closed>.title{border-bottom-color:transparent}.lil-gui+.controller{border-top:1px solid var(--widget-color);margin-top:0;padding-top:var(--spacing)}.lil-gui .lil-gui .lil-gui>.title{border:none}.lil-gui .lil-gui .lil-gui>.children{border:none;border-left:2px solid var(--widget-color);margin-left:var(--folder-indent)}.lil-gui .lil-gui .controller{border:none}.lil-gui input{-webkit-tap-highlight-color:transparent;background:var(--widget-color);border:0;border-radius:var(--widget-border-radius);color:var(--text-color);font-family:var(--font-family);font-size:var(--input-font-size);height:var(--widget-height);outline:none;width:100%}.lil-gui input:disabled{opacity:1}.lil-gui input[type=number],.lil-gui input[type=text]{padding:var(--widget-padding)}.lil-gui input[type=number]:focus,.lil-gui input[type=text]:focus{background:var(--focus-color)}.lil-gui input::-webkit-inner-spin-button,.lil-gui input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.lil-gui input[type=number]{-moz-appearance:textfield}.lil-gui input[type=checkbox]{appearance:none;-webkit-appearance:none;border-radius:var(--widget-border-radius);cursor:pointer;height:var(--checkbox-size);text-align:center;width:var(--checkbox-size)}.lil-gui input[type=checkbox]:checked:before{content:"✓";font-family:lil-gui;font-size:var(--checkbox-size);line-height:var(--checkbox-size)}.lil-gui button{-webkit-tap-highlight-color:transparent;background:var(--widget-color);border:1px solid var(--widget-color);border-radius:var(--widget-border-radius);color:var(--text-color);cursor:pointer;font-family:var(--font-family);font-size:var(--font-size);height:var(--widget-height);line-height:calc(var(--widget-height) - 4px);outline:none;text-align:center;text-transform:none;width:100%}.lil-gui button:active{background:var(--focus-color)}@font-face{font-family:lil-gui;src:url("data:application/font-woff;charset=utf-8;base64,d09GRgABAAAAAAUsAAsAAAAACJwAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABHU1VCAAABCAAAAH4AAADAImwmYE9TLzIAAAGIAAAAPwAAAGBKqH5SY21hcAAAAcgAAAD0AAACrukyyJBnbHlmAAACvAAAAF8AAACEIZpWH2hlYWQAAAMcAAAAJwAAADZfcj2zaGhlYQAAA0QAAAAYAAAAJAC5AHhobXR4AAADXAAAABAAAABMAZAAAGxvY2EAAANsAAAAFAAAACgCEgIybWF4cAAAA4AAAAAeAAAAIAEfABJuYW1lAAADoAAAASIAAAIK9SUU/XBvc3QAAATEAAAAZgAAAJCTcMc2eJxVjbEOgjAURU+hFRBK1dGRL+ALnAiToyMLEzFpnPz/eAshwSa97517c/MwwJmeB9kwPl+0cf5+uGPZXsqPu4nvZabcSZldZ6kfyWnomFY/eScKqZNWupKJO6kXN3K9uCVoL7iInPr1X5baXs3tjuMqCtzEuagm/AAlzQgPAAB4nGNgYRBlnMDAysDAYM/gBiT5oLQBAwuDJAMDEwMrMwNWEJDmmsJwgCFeXZghBcjlZMgFCzOiKOIFAB71Bb8AeJy1kjFuwkAQRZ+DwRAwBtNQRUGKQ8OdKCAWUhAgKLhIuAsVSpWz5Bbkj3dEgYiUIszqWdpZe+Z7/wB1oCYmIoboiwiLT2WjKl/jscrHfGg/pKdMkyklC5Zs2LEfHYpjcRoPzme9MWWmk3dWbK9ObkWkikOetJ554fWyoEsmdSlt+uR0pCJR34b6t/TVg1SY3sYvdf8vuiKrpyaDXDISiegp17p7579Gp3p++y7HPAiY9pmTibljrr85qSidtlg4+l25GLCaS8e6rRxNBmsnERunKbaOObRz7N72ju5vdAjYpBXHgJylOAVsMseDAPEP8LYoUHicY2BiAAEfhiAGJgZWBgZ7RnFRdnVJELCQlBSRlATJMoLV2DK4glSYs6ubq5vbKrJLSbGrgEmovDuDJVhe3VzcXFwNLCOILB/C4IuQ1xTn5FPilBTj5FPmBAB4WwoqAHicY2BkYGAA4sk1sR/j+W2+MnAzpDBgAyEMQUCSg4EJxAEAwUgFHgB4nGNgZGBgSGFggJMhDIwMqEAYAByHATJ4nGNgAIIUNEwmAABl3AGReJxjYAACIQYlBiMGJ3wQAEcQBEV4nGNgZGBgEGZgY2BiAAEQyQWEDAz/wXwGAAsPATIAAHicXdBNSsNAHAXwl35iA0UQXYnMShfS9GPZA7T7LgIu03SSpkwzYTIt1BN4Ak/gKTyAeCxfw39jZkjymzcvAwmAW/wgwHUEGDb36+jQQ3GXGot79L24jxCP4gHzF/EIr4jEIe7wxhOC3g2TMYy4Q7+Lu/SHuEd/ivt4wJd4wPxbPEKMX3GI5+DJFGaSn4qNzk8mcbKSR6xdXdhSzaOZJGtdapd4vVPbi6rP+cL7TGXOHtXKll4bY1Xl7EGnPtp7Xy2n00zyKLVHfkHBa4IcJ2oD3cgggWvt/V/FbDrUlEUJhTn/0azVWbNTNr0Ens8de1tceK9xZmfB1CPjOmPH4kitmvOubcNpmVTN3oFJyjzCvnmrwhJTzqzVj9jiSX911FjeAAB4nG3HMRKCMBBA0f0giiKi4DU8k0V2GWbIZDOh4PoWWvq6J5V8If9NVNQcaDhyouXMhY4rPTcG7jwYmXhKq8Wz+p762aNaeYXom2n3m2dLTVgsrCgFJ7OTmIkYbwIbC6vIB7WmFfAAAA==") format("woff")}@media (pointer:coarse){.lil-gui.allow-touch-styles{--widget-height:28px;--padding:6px;--spacing:6px;--font-size:13px;--input-font-size:16px;--folder-indent:10px;--scrollbar-width:7px;--slider-input-min-width:50px;--color-input-min-width:65px}}@media (hover:hover){.lil-gui .controller.color .display:hover:before{border:1px solid #fff9;border-radius:var(--widget-border-radius);bottom:0;content:" ";display:block;left:0;position:absolute;right:0;top:0}.lil-gui .controller.option .display.focus{background:var(--focus-color)}.lil-gui .controller.option .widget:hover .display{background:var(--hover-color)}.lil-gui .controller.number .slider:hover{background-color:var(--hover-color)}body:not(.lil-gui-dragging) .lil-gui .title:hover{background:var(--title-background-color);opacity:.85}.lil-gui .title:focus{text-decoration:underline var(--focus-color)}.lil-gui input:hover{background:var(--hover-color)}.lil-gui input:active{background:var(--focus-color)}.lil-gui input[type=checkbox]:focus{box-shadow:inset 0 0 0 1px var(--focus-color)}.lil-gui button:hover{background:var(--hover-color);border-color:var(--hover-color)}.lil-gui button:focus{border-color:var(--focus-color)}}'),ne=!0),i?i.appendChild(this.domElement):t&&(this.domElement.classList.add("autoPlace"),document.body.appendChild(this.domElement)),r&&this.domElement.style.setProperty("--width",r+"px"),this.domElement.addEventListener("keydown",l=>l.stopPropagation()),this.domElement.addEventListener("keyup",l=>l.stopPropagation())}add(e,t,i,r,a){if(Object(i)===i)return new Be(this,e,t,i);const o=e[t];switch(typeof o){case"number":return new Ge(this,e,t,i,r,a);case"boolean":return new Re(this,e,t);case"string":return new je(this,e,t);case"function":return new Y(this,e,t)}console.error(`gui.add failed
	property:`,t,`
	object:`,e,`
	value:`,o)}addColor(e,t,i=1){return new ze(this,e,t,i)}addFolder(e){return new q({parent:this,title:e})}load(e,t=!0){return e.controllers&&this.controllers.forEach(i=>{i instanceof Y||i._name in e.controllers&&i.load(e.controllers[i._name])}),t&&e.folders&&this.folders.forEach(i=>{i._title in e.folders&&i.load(e.folders[i._title])}),this}save(e=!0){const t={controllers:{},folders:{}};return this.controllers.forEach(i=>{if(!(i instanceof Y)){if(i._name in t.controllers)throw new Error(`Cannot save GUI with duplicate property "${i._name}"`);t.controllers[i._name]=i.save()}}),e&&this.folders.forEach(i=>{if(i._title in t.folders)throw new Error(`Cannot save GUI with duplicate folder "${i._title}"`);t.folders[i._title]=i.save()}),t}open(e=!0){return this._closed=!e,this.$title.setAttribute("aria-expanded",!this._closed),this.domElement.classList.toggle("closed",this._closed),this}close(){return this.open(!1)}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}openAnimated(e=!0){return this._closed=!e,this.$title.setAttribute("aria-expanded",!this._closed),requestAnimationFrame(()=>{const t=this.$children.clientHeight;this.$children.style.height=t+"px",this.domElement.classList.add("transition");const i=a=>{a.target===this.$children&&(this.$children.style.height="",this.domElement.classList.remove("transition"),this.$children.removeEventListener("transitionend",i))};this.$children.addEventListener("transitionend",i);const r=e?this.$children.scrollHeight:0;this.domElement.classList.toggle("closed",!e),requestAnimationFrame(()=>{this.$children.style.height=r+"px"})}),this}title(e){return this._title=e,this.$title.innerHTML=e,this}reset(e=!0){return(e?this.controllersRecursive():this.controllers).forEach(t=>t.reset()),this}onChange(e){return this._onChange=e,this}_callOnChange(e){this.parent&&this.parent._callOnChange(e),this._onChange!==void 0&&this._onChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(e){this.parent&&this.parent._callOnFinishChange(e),this._onFinishChange!==void 0&&this._onFinishChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}destroy(){this.parent&&(this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.folders.splice(this.parent.folders.indexOf(this),1)),this.domElement.parentElement&&this.domElement.parentElement.removeChild(this.domElement),Array.from(this.children).forEach(e=>e.destroy())}controllersRecursive(){let e=Array.from(this.controllers);return this.folders.forEach(t=>{e=e.concat(t.controllersRecursive())}),e}foldersRecursive(){let e=Array.from(this.folders);return this.folders.forEach(t=>{e=e.concat(t.foldersRecursive())}),e}}let d;const w=new _e;let _,m,v,N,M=null,L=null,D=null,C=null,H=null,b=1,f=null,T=!1,S=null;const $={maxFar:30,lightNear:.1,lightFar:50,lightMargin:30,lightIntensity:10},oe=new Oe,le=new he,We="./glb/burnout_revenge_-_central_route_crash_junction.glb",x=new g(21.5,4,15),V={person1:{url:"./glb/person1.glb",scale:.001,idleAnim:"idle1",walkAnim:"walk",runAnim:"run",jumpAnim:"jump",flyAnim:"flying",flyIdleAnim:"flyidle",enterCarAnim:"enterCar",exitCarAnim:"exitCar",headObjName:"mixamorigHead",rotateY:Math.PI},person2:{url:"./glb/person2.glb",scale:.001,idleAnim:"idle1",walkAnim:"walk",runAnim:"run",jumpAnim:"jump",flyAnim:"flying",flyIdleAnim:"flyidle",enterCarAnim:"enterCar",exitCarAnim:"exitCar",headObjName:"mixamorigHead",rotateY:Math.PI},person3:{url:"./glb/person3.glb",scale:.005,idleAnim:"idle",walkAnim:"walk",runAnim:"run",jumpAnim:"jump",flyAnim:"flying",flyIdleAnim:"flyidle",enterCarAnim:"enterCar",exitCarAnim:"exitCar",headObjName:"mixamorigHead",rotateY:Math.PI}},Z={bugatti:{url:"./glb/bugatti.glb",scale:.1,wheelsNames:["Wheel_LF","Wheel_RF","Wheel_LR","Wheel_RR"],animations:{openDoorAnim:"openDoorLF"},boardingPoint:new g(.5,0,1.8),seatOffset:new g(0,.6,0),chassisRatio:.15,suspensionRestLengthRatio:.2},landRover:{url:"./glb/landRover.glb",scale:.08,wheelsNames:["WheelFL","WheelFR","WheelBL","WheelBR"],animations:{openDoorAnim:"opendoor"},boardingPoint:new g(.95,0,2.15),seatOffset:new g(0,.7,0),chassisRatio:.4,suspensionRestLengthRatio:.2},tesla:{url:"./glb/tesla2.glb",scale:.09,wheelsNames:["WHEEL_LF","WHEEL_RF","WHEEL_LR","WHEEL_RR"],animations:{openDoorAnim:"opendoor"},boardingPoint:new g(1,0,1.9),seatOffset:new g(.1,.5,0),chassisRatio:.4,suspensionRestLengthRatio:.2,followVehicleDirection:!1}};Je();function I(s){if(!s||!C)return;(Array.isArray(s)?s:[s]).forEach(t=>C.setupMaterial(t))}function ce(s,e){const t=new He({maxFar:$.maxFar*e,cascades:3,mode:"practical",parent:w,shadowMapSize:s,shadowBias:-1e-5,lightDirection:new g(-1,-2,-1).normalize(),lightIntensity:$.lightIntensity,lightNear:$.lightNear*e,lightFar:$.lightFar*e,camera:_,fade:!0,lightMargin:$.lightMargin*e});return t.lights.forEach((i,r)=>{const a=Math.pow(2,r);i.shadow.bias=-1e-4*a,i.shadow.normalBias=.002*a}),t}function Xe(s){C.remove(),C.dispose();const e=m.capabilities.maxTextureSize;C=ce(Math.min(2048,e),s),w.traverse(t=>{t.isMesh&&I(t.material)})}function Q(s){const e=V[s];return{...e,scale:e.scale*b}}function Ye(s){const e=Z[s];return{...e,scale:e.scale*b}}async function Je(){const s=document.querySelector("#container");m=new ve({antialias:!0}),m.setSize(s.clientWidth,s.clientHeight),m.shadowMap.enabled=!1,m.toneMapping=be,m.toneMappingExposure=1,m.setAnimationLoop(et),s.appendChild(m.domElement),_=new Se(60,s.clientWidth/s.clientHeight,.01,1e3),_.position.copy(x),_.lookAt(x.x,x.y,x.z+1),v=new Pe(_,m.domElement),v.enableDamping=!0,v.maxDistance=2e3,v.dampingFactor=.1,v.rotateSpeed=1,v.maxPolarAngle=Math.PI/2,v.target.set(x.x,x.y,x.z+1);const e=m.capabilities.maxTextureSize,t=Math.min(2048,e);C=ce(t,1),C.lights.forEach((o,n)=>{const l=Math.pow(2,n);o.shadow.bias=-1e-4*l,o.shadow.normalBias=.002*l});const i=new Ae(16777215,5);w.add(i),new ye().load("./img/1.hdr",o=>{o.mapping=Le,w.background=o},void 0,o=>console.warn("HDR 加载失败：",o)),D=new Ee,Object.assign(D.dom.style,{position:"fixed",bottom:"0",left:"0",top:"auto",zIndex:"9998"}),document.body.appendChild(D.dom);const r=new xe(.05,16,16),a=new Ce({color:65535,opacity:.8,transparent:!0,depthTest:!1});L=new Me(r,a),L.visible=!1,L.renderOrder=999,w.add(L),Ke(),await pe(We),m.render(w,_),d=de(),await d.init({scene:w,camera:_,controls:v,playerModel:V.person1,initPos:x,minCamDistance:50,maxCamDistance:220,enableOverShoulderView:!0}),d.getPerson()?.traverse(o=>{o.isMesh&&(o.castShadow=!0,o.receiveShadow=!0,I(o.material))}),st(),window.addEventListener("resize",it,!1),window.hideLoader()}function Ke(){N=new De;const s=new Ie;s.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/"),N.setDRACOLoader(s);const e=new $e;e.setTranscoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/"),e.detectSupport(m),N.setKTX2Loader(e)}async function pe(s,e=[10,10,10]){try{const i=(await N.loadAsync(s)).scene;i.name="sceneGLB",i.scale.set(...e),i.traverse(r=>{r.isMesh&&(r.castShadow=!0,r.receiveShadow=!0,I(r.material))}),w.add(i)}catch(t){console.error("GLB 加载失败：",t)}}async function Ze(s){const e=URL.createObjectURL(s);document.pointerLockElement&&await new Promise(i=>{document.addEventListener("pointerlockchange",i,{once:!0}),document.exitPointerLock()});const t=w.getObjectByName("sceneGLB");t&&(t.traverse(i=>{i.isMesh&&(i.geometry?.dispose(),(Array.isArray(i.material)?i.material:[i.material]).forEach(a=>a?.dispose()))}),w.remove(t)),d?.destroy(),d=null,await pe(e,[1,1,1]),H&&URL.revokeObjectURL(H),H=e,await Qe(M?.playerModel??"person1")}async function Qe(s){T=!0;const e=V[s];if(f=(await N.loadAsync(e.url)).scene,f.scale.setScalar(e.scale*b),f.visible=!1,f.traverse(i=>{i.isMesh&&(Array.isArray(i.material)?i.material:[i.material]).forEach(a=>{a.transparent=!0,a.opacity=.5,a.depthWrite=!1})}),w.add(f),S){const i=S.querySelector("input[type=range]"),r=S.querySelector("span:last-child");i&&(i.value=String(Math.log10(b))),r&&(r.textContent=b.toFixed(2))}else{S=document.createElement("div"),Object.assign(S.style,{position:"fixed",bottom:"20px",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.65)",color:"#fff",padding:"12px 24px",borderRadius:"8px",fontSize:"14px",zIndex:"9999",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:"8px"});const i=document.createElement("span");i.textContent="移动鼠标预览人物位置 · 双击确认放置";const r=document.createElement("div");Object.assign(r.style,{display:"flex",alignItems:"center",gap:"8px"});const a=document.createElement("span");a.textContent="人物比例：";const o=document.createElement("input");o.type="range",o.min="-2",o.max="2",o.step="0.01",o.value=String(Math.log10(b)),o.style.width="160px";const n=document.createElement("span");n.textContent=b.toFixed(2),o.addEventListener("input",()=>{b=Math.pow(10,parseFloat(o.value)),n.textContent=b.toFixed(2),f&&f.scale.setScalar(e.scale*b)}),r.append(a,o,n),S.append(i,r),document.body.appendChild(S)}S.style.display="flex",m.domElement.addEventListener("mousemove",ue),m.domElement.addEventListener("dblclick",ge)}function qe(){T=!1,v.enableZoom=!0,f&&(f.traverse(s=>{s.isMesh&&(s.geometry?.dispose(),(Array.isArray(s.material)?s.material:[s.material]).forEach(t=>t?.dispose()))}),w.remove(f),f=null),S&&(S.style.display="none"),m.domElement.removeEventListener("mousemove",ue),m.domElement.removeEventListener("dblclick",ge)}function ue(s){if(!T||!f)return;le.set(s.clientX/window.innerWidth*2-1,-(s.clientY/window.innerHeight)*2+1),oe.setFromCamera(le,_);const e=w.getObjectByName("sceneGLB");if(!e)return;const t=oe.intersectObject(e,!0);t.length>0?(f.position.copy(t[0].point),f.visible=!0):f.visible=!1}async function ge(){if(!T||!f?.visible)return;const s=f.position.clone(),e=Q(M?.playerModel??"person1");s.y+=180*e.scale*.75,qe(),Xe(b),d=de(),await d.init({scene:w,camera:_,controls:v,playerModel:Q(M?.playerModel??"person1"),initPos:s,minCamDistance:50,maxCamDistance:220,colliderMeshUrl:H,enableOverShoulderView:M?.enableOverShoulderView??!0,thirdMouseMode:M?.thirdMouseMode??1}),d.getPerson()?.traverse(t=>{t.isMesh&&(t.castShadow=!0,t.receiveShadow=!0,I(t.material))})}function et(){d?(d.update(),tt()):v.update(),C?.update(),m.render(w,_),D?.update()}function tt(){if(!M?.centerRaycast)return;const s=d.getCenterScreenRaycastHit();s?(L.position.copy(s.point),L.visible=!0):L.visible=!1}function it(){_.aspect=window.innerWidth/window.innerHeight,m.setSize(window.innerWidth,window.innerHeight),_.updateProjectionMatrix(),m.setPixelRatio(window.devicePixelRatio*1)}function st(){const s=new q({title:"Debug Panel",width:280});Object.assign(s.domElement.style,{position:"fixed",top:"12px",right:"12px",zIndex:"9999"}),["pointerdown","mousedown","click"].forEach(n=>{s.domElement.addEventListener(n,l=>l.stopPropagation())});const e=document.createElement("input");e.type="file",e.accept=".gltf,.glb",e.style.display="none",document.body.appendChild(e),e.addEventListener("change",async n=>{const l=n.target.files?.[0];l&&(await Ze(l),e.value="")}),s.add({upload:()=>e.click()},"upload").name("Change Scene (.glb/.gltf)");const t={playerModel:"person1",vehicleType:"bugatti",showFPS:!0,showShadow:!1,mouseSensitivity:5,gravity:-2400,jumpHeight:600,playerSpeed:300,flySpeed:2100,minCamDistance:50,maxCamDistance:220,thirdMouseMode:1,enableZoom:!1,debug:!1,enableOverShoulderView:!0,centerRaycast:!1},i={...t};s.add(t,"playerModel",Object.keys(V)).name("Player Model").onChange(async n=>{await d.switchPlayerModel(Q(n)),d.getPerson()?.traverse(l=>{l.isMesh&&(l.castShadow=!0,l.receiveShadow=!0,I(l.material),n=="person6"&&(l.material.metalness=.8,l.material.roughness=0))}),d.registerAnimation("flyFight","flyFight",{loop:!1,clampWhenFinished:!0,duration:1,onFinished:()=>{d.playAnimation("flyidle")}})});const r=s.addFolder("Add Vehicle");["pointerdown","mousedown","click"].forEach(n=>{r.domElement.addEventListener(n,l=>l.stopPropagation())}),r.add(t,"vehicleType",Object.keys(Z)).name("Vehicle Type");const a=r.add({spawn:async()=>{if(d.getAllVehicles().length>=5){alert("For performance reasons, the demo supports a maximum of 5 vehicles.");return}if(!Z[t.vehicleType])return;const l=d.getPosition(),c=new g;_.getWorldDirection(c),c.y=0,c.normalize();const h=l.clone().addScaledVector(c,.5);h.y=l.y,await d.loadVehicleModel({...Ye(t.vehicleType),position:h}),d.getAllVehicles().at(-1)?.vehicleGroup?.traverse(u=>{u.isMesh&&(u.castShadow=!0,u.receiveShadow=!0,I(u.material),u.material.metalness=.8,u.material.roughness=0)})}},"spawn").name("Spawn Vehicle");["pointerdown","mousedown","click"].forEach(n=>{a.domElement.addEventListener(n,l=>l.stopPropagation())}),s.add(t,"showFPS").name("Show FPS").onChange(n=>D.dom.style.display=n?"block":"none"),s.add(t,"showShadow").name("Show Shadow").onChange(n=>{m.shadowMap.enabled=n,w.traverse(l=>{l.isMesh&&(l.material.needsUpdate=!0)})}),s.add(t,"mouseSensitivity",1,20,.1).onChange(n=>d.setMouseSensitivity(n)),s.add(t,"gravity",-6e3,0,50).onChange(n=>d.setGravity(n)),s.add(t,"jumpHeight",0,2e3,10).onChange(n=>d.setJumpHeight(n)),s.add(t,"playerSpeed",0,1e3,10).onChange(n=>d.setPlayerSpeed(n)),s.add(t,"flySpeed",0,5e3,10).onChange(n=>d.setPlayerFlySpeed(n)),s.add(t,"minCamDistance",0,200,1).onChange(n=>d.setMinCamDistance(n)),s.add(t,"maxCamDistance",50,1e3,1).onChange(n=>d.setMaxCamDistance(n)),s.add(t,"thirdMouseMode",{0:0,1:1,2:2,3:3}).onChange(n=>d.setThirdMouseMode(Number(n))),s.add(t,"enableZoom").onChange(n=>d.setEnableZoom(n)),s.add(t,"debug").onChange(n=>d.setDebug(n)),s.add(t,"enableOverShoulderView").onChange(n=>d.setOverShoulderView(n)),s.add(t,"centerRaycast").name("Center Raycast Debug").onChange(n=>{n||(L.visible=!1)});const o=s.add({resetToDefault:()=>{Object.assign(t,i),s.controllers.forEach(n=>n.updateDisplay()),s.folders.forEach(n=>n.controllers.forEach(l=>l.updateDisplay())),d.setMouseSensitivity(i.mouseSensitivity),d.setGravity(i.gravity),d.setJumpHeight(i.jumpHeight),d.setPlayerSpeed(i.playerSpeed),d.setPlayerFlySpeed(i.flySpeed),d.setMinCamDistance(i.minCamDistance),d.setMaxCamDistance(i.maxCamDistance),d.setThirdMouseMode(i.thirdMouseMode),d.setEnableZoom(i.enableZoom),d.setDebug(i.debug),d.setOverShoulderView(i.enableOverShoulderView),L.visible=!1,D&&(D.dom.style.display="none")}},"resetToDefault").name("Reset to Default");["pointerdown","mousedown","click"].forEach(n=>{o.domElement.addEventListener(n,l=>l.stopPropagation())}),M=t}
