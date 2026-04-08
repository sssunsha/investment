import{a as oe,b as le}from"./chunk-G5JTDYWN.js";import{a as ce}from"./chunk-HVYKDPEF.js";import{a as ae,d as ie,e as ne,g as de,h as re}from"./chunk-BP7CQH4F.js";import{a as J,c as K,d as $,e as ee,f as te}from"./chunk-OSJPHBTL.js";import{$a as N,Da as w,Ea as O,Eb as U,Fb as C,Ga as L,Gb as Z,Hb as Y,Ka as u,L as A,La as t,Ma as a,N as b,Na as l,P as z,Pa as R,Qa as S,R as s,Sa as p,Ta as f,Va as j,Wa as B,X as F,Xa as V,Ya as q,_a as h,aa as D,ab as d,cb as X,fa as P,fb as y,gb as k,hb as x,ia as T,ib as G,oa as o,qb as W,sb as H,tb as g,ub as Q,va as m,wa as _}from"./chunk-D4MPNHUN.js";var se=(()=>{class r{static \u0275fac=function(n){return new(n||r)};static \u0275mod=_({type:r});static \u0275inj=b({imports:[C]})}return r})();var pe=["mat-internal-form-field",""],fe=["*"],me=(()=>{class r{labelPosition="after";static \u0275fac=function(n){return new(n||r)};static \u0275cmp=m({type:r,selectors:[["div","mat-internal-form-field",""]],hostAttrs:[1,"mdc-form-field","mat-internal-form-field"],hostVars:2,hostBindings:function(n,i){n&2&&h("mdc-form-field--align-end",i.labelPosition==="before")},inputs:{labelPosition:"labelPosition"},attrs:pe,ngContentSelectors:fe,decls:1,vars:0,template:function(n,i){n&1&&(p(),f(0))},styles:[`.mat-internal-form-field {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.mat-internal-form-field > label {
  margin-left: 0;
  margin-right: auto;
  padding-left: 4px;
  padding-right: 0;
  order: 0;
}
[dir=rtl] .mat-internal-form-field > label {
  margin-left: auto;
  margin-right: 0;
  padding-left: 0;
  padding-right: 4px;
}

.mdc-form-field--align-end > label {
  margin-left: auto;
  margin-right: 0;
  padding-left: 0;
  padding-right: 4px;
  order: -1;
}
[dir=rtl] .mdc-form-field--align-end .mdc-form-field--align-end label {
  margin-left: 0;
  margin-right: auto;
  padding-left: 4px;
  padding-right: 0;
}
`],encapsulation:2,changeDetection:0})}return r})();var ve=["switch"],be=["*"];function _e(r,v){r&1&&(t(0,"span",11),F(),t(1,"svg",13),l(2,"path",14),a(),t(3,"svg",15),l(4,"path",16),a()())}var we=new z("mat-slide-toggle-default-options",{providedIn:"root",factory:()=>({disableToggleValue:!1,hideIcon:!1,disabledInteractive:!1})}),M=class{source;checked;constructor(v,e){this.source=v,this.checked=e}},E=(()=>{class r{_elementRef=s(T);_focusMonitor=s(ae);_changeDetectorRef=s(H);defaults=s(we);_onChange=e=>{};_onTouched=()=>{};_validatorOnChange=()=>{};_uniqueId;_checked=!1;_createChangeEvent(e){return new M(this,e)}_labelId;get buttonId(){return`${this.id||this._uniqueId}-button`}_switchElement;focus(){this._switchElement.nativeElement.focus()}_noopAnimations=de();_focused=!1;name=null;id;labelPosition="after";ariaLabel=null;ariaLabelledby=null;ariaDescribedby;required=!1;color;disabled=!1;disableRipple=!1;tabIndex=0;get checked(){return this._checked}set checked(e){this._checked=e,this._changeDetectorRef.markForCheck()}hideIcon;disabledInteractive;change=new D;toggleChange=new D;get inputId(){return`${this.id||this._uniqueId}-input`}constructor(){s(U).load(ne);let e=s(new W("tabindex"),{optional:!0}),n=this.defaults;this.tabIndex=e==null?0:parseInt(e)||0,this.color=n.color||"accent",this.id=this._uniqueId=s(ie).getId("mat-mdc-slide-toggle-"),this.hideIcon=n.hideIcon??!1,this.disabledInteractive=n.disabledInteractive??!1,this._labelId=this._uniqueId+"-label"}ngAfterContentInit(){this._focusMonitor.monitor(this._elementRef,!0).subscribe(e=>{e==="keyboard"||e==="program"?(this._focused=!0,this._changeDetectorRef.markForCheck()):e||Promise.resolve().then(()=>{this._focused=!1,this._onTouched(),this._changeDetectorRef.markForCheck()})})}ngOnChanges(e){e.required&&this._validatorOnChange()}ngOnDestroy(){this._focusMonitor.stopMonitoring(this._elementRef)}writeValue(e){this.checked=!!e}registerOnChange(e){this._onChange=e}registerOnTouched(e){this._onTouched=e}validate(e){return this.required&&e.value!==!0?{required:!0}:null}registerOnValidatorChange(e){this._validatorOnChange=e}setDisabledState(e){this.disabled=e,this._changeDetectorRef.markForCheck()}toggle(){this.checked=!this.checked,this._onChange(this.checked)}_emitChangeEvent(){this._onChange(this.checked),this.change.emit(this._createChangeEvent(this.checked))}_handleClick(){this.disabled||(this.toggleChange.emit(),this.defaults.disableToggleValue||(this.checked=!this.checked,this._onChange(this.checked),this.change.emit(new M(this,this.checked))))}_getAriaLabelledBy(){return this.ariaLabelledby?this.ariaLabelledby:this.ariaLabel?null:this._labelId}static \u0275fac=function(n){return new(n||r)};static \u0275cmp=m({type:r,selectors:[["mat-slide-toggle"]],viewQuery:function(n,i){if(n&1&&j(ve,5),n&2){let c;B(c=V())&&(i._switchElement=c.first)}},hostAttrs:[1,"mat-mdc-slide-toggle"],hostVars:13,hostBindings:function(n,i){n&2&&(R("id",i.id),w("tabindex",null)("aria-label",null)("name",null)("aria-labelledby",null),N(i.color?"mat-"+i.color:""),h("mat-mdc-slide-toggle-focused",i._focused)("mat-mdc-slide-toggle-checked",i.checked)("_mat-animation-noopable",i._noopAnimations))},inputs:{name:"name",id:"id",labelPosition:"labelPosition",ariaLabel:[0,"aria-label","ariaLabel"],ariaLabelledby:[0,"aria-labelledby","ariaLabelledby"],ariaDescribedby:[0,"aria-describedby","ariaDescribedby"],required:[2,"required","required",g],color:"color",disabled:[2,"disabled","disabled",g],disableRipple:[2,"disableRipple","disableRipple",g],tabIndex:[2,"tabIndex","tabIndex",e=>e==null?0:Q(e)],checked:[2,"checked","checked",g],hideIcon:[2,"hideIcon","hideIcon",g],disabledInteractive:[2,"disabledInteractive","disabledInteractive",g]},outputs:{change:"change",toggleChange:"toggleChange"},exportAs:["matSlideToggle"],features:[G([{provide:J,useExisting:A(()=>r),multi:!0},{provide:K,useExisting:r,multi:!0}]),P],ngContentSelectors:be,decls:14,vars:27,consts:[["switch",""],["mat-internal-form-field","",3,"labelPosition"],["role","switch","type","button",1,"mdc-switch",3,"click","tabIndex","disabled"],[1,"mat-mdc-slide-toggle-touch-target"],[1,"mdc-switch__track"],[1,"mdc-switch__handle-track"],[1,"mdc-switch__handle"],[1,"mdc-switch__shadow"],[1,"mdc-elevation-overlay"],[1,"mdc-switch__ripple"],["mat-ripple","",1,"mat-mdc-slide-toggle-ripple","mat-focus-indicator",3,"matRippleTrigger","matRippleDisabled","matRippleCentered"],[1,"mdc-switch__icons"],[1,"mdc-label",3,"click","for"],["viewBox","0 0 24 24","aria-hidden","true",1,"mdc-switch__icon","mdc-switch__icon--on"],["d","M19.69,5.23L8.96,15.96l-4.23-4.23L2.96,13.5l6,6L21.46,7L19.69,5.23z"],["viewBox","0 0 24 24","aria-hidden","true",1,"mdc-switch__icon","mdc-switch__icon--off"],["d","M20 13H4v-2h16v2z"]],template:function(n,i){if(n&1&&(p(),t(0,"div",1)(1,"button",2,0),S("click",function(){return i._handleClick()}),l(3,"div",3)(4,"span",4),t(5,"span",5)(6,"span",6)(7,"span",7),l(8,"span",8),a(),t(9,"span",9),l(10,"span",10),a(),O(11,_e,5,0,"span",11),a()()(),t(12,"label",12),S("click",function(ue){return ue.stopPropagation()}),f(13),a()()),n&2){let c=q(2);u("labelPosition",i.labelPosition),o(),h("mdc-switch--selected",i.checked)("mdc-switch--unselected",!i.checked)("mdc-switch--checked",i.checked)("mdc-switch--disabled",i.disabled)("mat-mdc-slide-toggle-disabled-interactive",i.disabledInteractive),u("tabIndex",i.disabled&&!i.disabledInteractive?-1:i.tabIndex)("disabled",i.disabled&&!i.disabledInteractive),w("id",i.buttonId)("name",i.name)("aria-label",i.ariaLabel)("aria-labelledby",i._getAriaLabelledBy())("aria-describedby",i.ariaDescribedby)("aria-required",i.required||null)("aria-checked",i.checked)("aria-disabled",i.disabled&&i.disabledInteractive?"true":null),o(9),u("matRippleTrigger",c)("matRippleDisabled",i.disableRipple||i.disabled)("matRippleCentered",!0),o(),L(i.hideIcon?-1:11),o(),u("for",i.buttonId),w("id",i._labelId)}},dependencies:[re,me],styles:[`.mdc-switch {
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  margin: 0;
  outline: none;
  overflow: visible;
  padding: 0;
  position: relative;
  width: var(--mat-slide-toggle-track-width, 52px);
}
.mdc-switch.mdc-switch--disabled {
  cursor: default;
  pointer-events: none;
}
.mdc-switch.mat-mdc-slide-toggle-disabled-interactive {
  pointer-events: auto;
}

.mdc-switch__track {
  overflow: hidden;
  position: relative;
  width: 100%;
  height: var(--mat-slide-toggle-track-height, 32px);
  border-radius: var(--mat-slide-toggle-track-shape, var(--mat-sys-corner-full));
}
.mdc-switch--disabled.mdc-switch .mdc-switch__track {
  opacity: var(--mat-slide-toggle-disabled-track-opacity, 0.12);
}
.mdc-switch__track::before, .mdc-switch__track::after {
  border: 1px solid transparent;
  border-radius: inherit;
  box-sizing: border-box;
  content: "";
  height: 100%;
  left: 0;
  position: absolute;
  width: 100%;
  border-width: var(--mat-slide-toggle-track-outline-width, 2px);
  border-color: var(--mat-slide-toggle-track-outline-color, var(--mat-sys-outline));
}
.mdc-switch--selected .mdc-switch__track::before, .mdc-switch--selected .mdc-switch__track::after {
  border-width: var(--mat-slide-toggle-selected-track-outline-width, 2px);
  border-color: var(--mat-slide-toggle-selected-track-outline-color, transparent);
}
.mdc-switch--disabled .mdc-switch__track::before, .mdc-switch--disabled .mdc-switch__track::after {
  border-width: var(--mat-slide-toggle-disabled-unselected-track-outline-width, 2px);
  border-color: var(--mat-slide-toggle-disabled-unselected-track-outline-color, var(--mat-sys-on-surface));
}
@media (forced-colors: active) {
  .mdc-switch__track {
    border-color: currentColor;
  }
}
.mdc-switch__track::before {
  transition: transform 75ms 0ms cubic-bezier(0, 0, 0.2, 1);
  transform: translateX(0);
  background: var(--mat-slide-toggle-unselected-track-color, var(--mat-sys-surface-variant));
}
.mdc-switch--selected .mdc-switch__track::before {
  transition: transform 75ms 0ms cubic-bezier(0.4, 0, 0.6, 1);
  transform: translateX(100%);
}
[dir=rtl] .mdc-switch--selected .mdc-switch--selected .mdc-switch__track::before {
  transform: translateX(-100%);
}
.mdc-switch--selected .mdc-switch__track::before {
  opacity: var(--mat-slide-toggle-hidden-track-opacity, 0);
  transition: var(--mat-slide-toggle-hidden-track-transition, opacity 75ms);
}
.mdc-switch--unselected .mdc-switch__track::before {
  opacity: var(--mat-slide-toggle-visible-track-opacity, 1);
  transition: var(--mat-slide-toggle-visible-track-transition, opacity 75ms);
}
.mdc-switch:enabled:hover:not(:focus):not(:active) .mdc-switch__track::before {
  background: var(--mat-slide-toggle-unselected-hover-track-color, var(--mat-sys-surface-variant));
}
.mdc-switch:enabled:focus:not(:active) .mdc-switch__track::before {
  background: var(--mat-slide-toggle-unselected-focus-track-color, var(--mat-sys-surface-variant));
}
.mdc-switch:enabled:active .mdc-switch__track::before {
  background: var(--mat-slide-toggle-unselected-pressed-track-color, var(--mat-sys-surface-variant));
}
.mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:hover:not(:focus):not(:active) .mdc-switch__track::before, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:focus:not(:active) .mdc-switch__track::before, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:active .mdc-switch__track::before, .mdc-switch.mdc-switch--disabled .mdc-switch__track::before {
  background: var(--mat-slide-toggle-disabled-unselected-track-color, var(--mat-sys-surface-variant));
}
.mdc-switch__track::after {
  transform: translateX(-100%);
  background: var(--mat-slide-toggle-selected-track-color, var(--mat-sys-primary));
}
[dir=rtl] .mdc-switch__track::after {
  transform: translateX(100%);
}
.mdc-switch--selected .mdc-switch__track::after {
  transform: translateX(0);
}
.mdc-switch--selected .mdc-switch__track::after {
  opacity: var(--mat-slide-toggle-visible-track-opacity, 1);
  transition: var(--mat-slide-toggle-visible-track-transition, opacity 75ms);
}
.mdc-switch--unselected .mdc-switch__track::after {
  opacity: var(--mat-slide-toggle-hidden-track-opacity, 0);
  transition: var(--mat-slide-toggle-hidden-track-transition, opacity 75ms);
}
.mdc-switch:enabled:hover:not(:focus):not(:active) .mdc-switch__track::after {
  background: var(--mat-slide-toggle-selected-hover-track-color, var(--mat-sys-primary));
}
.mdc-switch:enabled:focus:not(:active) .mdc-switch__track::after {
  background: var(--mat-slide-toggle-selected-focus-track-color, var(--mat-sys-primary));
}
.mdc-switch:enabled:active .mdc-switch__track::after {
  background: var(--mat-slide-toggle-selected-pressed-track-color, var(--mat-sys-primary));
}
.mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:hover:not(:focus):not(:active) .mdc-switch__track::after, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:focus:not(:active) .mdc-switch__track::after, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:active .mdc-switch__track::after, .mdc-switch.mdc-switch--disabled .mdc-switch__track::after {
  background: var(--mat-slide-toggle-disabled-selected-track-color, var(--mat-sys-on-surface));
}

.mdc-switch__handle-track {
  height: 100%;
  pointer-events: none;
  position: absolute;
  top: 0;
  transition: transform 75ms 0ms cubic-bezier(0.4, 0, 0.2, 1);
  left: 0;
  right: auto;
  transform: translateX(0);
  width: calc(100% - var(--mat-slide-toggle-handle-width));
}
[dir=rtl] .mdc-switch__handle-track {
  left: auto;
  right: 0;
}
.mdc-switch--selected .mdc-switch__handle-track {
  transform: translateX(100%);
}
[dir=rtl] .mdc-switch--selected .mdc-switch__handle-track {
  transform: translateX(-100%);
}

.mdc-switch__handle {
  display: flex;
  pointer-events: auto;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 0;
  right: auto;
  transition: width 75ms cubic-bezier(0.4, 0, 0.2, 1), height 75ms cubic-bezier(0.4, 0, 0.2, 1), margin 75ms cubic-bezier(0.4, 0, 0.2, 1);
  width: var(--mat-slide-toggle-handle-width);
  height: var(--mat-slide-toggle-handle-height);
  border-radius: var(--mat-slide-toggle-handle-shape, var(--mat-sys-corner-full));
}
[dir=rtl] .mdc-switch__handle {
  left: auto;
  right: 0;
}
.mat-mdc-slide-toggle .mdc-switch--unselected .mdc-switch__handle {
  width: var(--mat-slide-toggle-unselected-handle-size, 16px);
  height: var(--mat-slide-toggle-unselected-handle-size, 16px);
  margin: var(--mat-slide-toggle-unselected-handle-horizontal-margin, 0 8px);
}
.mat-mdc-slide-toggle .mdc-switch--unselected .mdc-switch__handle:has(.mdc-switch__icons) {
  margin: var(--mat-slide-toggle-unselected-with-icon-handle-horizontal-margin, 0 4px);
}
.mat-mdc-slide-toggle .mdc-switch--selected .mdc-switch__handle {
  width: var(--mat-slide-toggle-selected-handle-size, 24px);
  height: var(--mat-slide-toggle-selected-handle-size, 24px);
  margin: var(--mat-slide-toggle-selected-handle-horizontal-margin, 0 24px);
}
.mat-mdc-slide-toggle .mdc-switch--selected .mdc-switch__handle:has(.mdc-switch__icons) {
  margin: var(--mat-slide-toggle-selected-with-icon-handle-horizontal-margin, 0 24px);
}
.mat-mdc-slide-toggle .mdc-switch__handle:has(.mdc-switch__icons) {
  width: var(--mat-slide-toggle-with-icon-handle-size, 24px);
  height: var(--mat-slide-toggle-with-icon-handle-size, 24px);
}
.mat-mdc-slide-toggle .mdc-switch:active:not(.mdc-switch--disabled) .mdc-switch__handle {
  width: var(--mat-slide-toggle-pressed-handle-size, 28px);
  height: var(--mat-slide-toggle-pressed-handle-size, 28px);
}
.mat-mdc-slide-toggle .mdc-switch--selected:active:not(.mdc-switch--disabled) .mdc-switch__handle {
  margin: var(--mat-slide-toggle-selected-pressed-handle-horizontal-margin, 0 22px);
}
.mat-mdc-slide-toggle .mdc-switch--unselected:active:not(.mdc-switch--disabled) .mdc-switch__handle {
  margin: var(--mat-slide-toggle-unselected-pressed-handle-horizontal-margin, 0 2px);
}
.mdc-switch--disabled.mdc-switch--selected .mdc-switch__handle::after {
  opacity: var(--mat-slide-toggle-disabled-selected-handle-opacity, 1);
}
.mdc-switch--disabled.mdc-switch--unselected .mdc-switch__handle::after {
  opacity: var(--mat-slide-toggle-disabled-unselected-handle-opacity, 0.38);
}
.mdc-switch__handle::before, .mdc-switch__handle::after {
  border: 1px solid transparent;
  border-radius: inherit;
  box-sizing: border-box;
  content: "";
  width: 100%;
  height: 100%;
  left: 0;
  position: absolute;
  top: 0;
  transition: background-color 75ms 0ms cubic-bezier(0.4, 0, 0.2, 1), border-color 75ms 0ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: -1;
}
@media (forced-colors: active) {
  .mdc-switch__handle::before, .mdc-switch__handle::after {
    border-color: currentColor;
  }
}
.mdc-switch--selected:enabled .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-selected-handle-color, var(--mat-sys-on-primary));
}
.mdc-switch--selected:enabled:hover:not(:focus):not(:active) .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-selected-hover-handle-color, var(--mat-sys-primary-container));
}
.mdc-switch--selected:enabled:focus:not(:active) .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-selected-focus-handle-color, var(--mat-sys-primary-container));
}
.mdc-switch--selected:enabled:active .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-selected-pressed-handle-color, var(--mat-sys-primary-container));
}
.mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled.mdc-switch--selected:hover:not(:focus):not(:active) .mdc-switch__handle::after, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled.mdc-switch--selected:focus:not(:active) .mdc-switch__handle::after, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled.mdc-switch--selected:active .mdc-switch__handle::after, .mdc-switch--selected.mdc-switch--disabled .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-disabled-selected-handle-color, var(--mat-sys-surface));
}
.mdc-switch--unselected:enabled .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-unselected-handle-color, var(--mat-sys-outline));
}
.mdc-switch--unselected:enabled:hover:not(:focus):not(:active) .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-unselected-hover-handle-color, var(--mat-sys-on-surface-variant));
}
.mdc-switch--unselected:enabled:focus:not(:active) .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-unselected-focus-handle-color, var(--mat-sys-on-surface-variant));
}
.mdc-switch--unselected:enabled:active .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-unselected-pressed-handle-color, var(--mat-sys-on-surface-variant));
}
.mdc-switch--unselected.mdc-switch--disabled .mdc-switch__handle::after {
  background: var(--mat-slide-toggle-disabled-unselected-handle-color, var(--mat-sys-on-surface));
}
.mdc-switch__handle::before {
  background: var(--mat-slide-toggle-handle-surface-color);
}

.mdc-switch__shadow {
  border-radius: inherit;
  bottom: 0;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
}
.mdc-switch:enabled .mdc-switch__shadow {
  box-shadow: var(--mat-slide-toggle-handle-elevation-shadow);
}
.mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:hover:not(:focus):not(:active) .mdc-switch__shadow, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:focus:not(:active) .mdc-switch__shadow, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:active .mdc-switch__shadow, .mdc-switch.mdc-switch--disabled .mdc-switch__shadow {
  box-shadow: var(--mat-slide-toggle-disabled-handle-elevation-shadow);
}

.mdc-switch__ripple {
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: -1;
  width: var(--mat-slide-toggle-state-layer-size, 40px);
  height: var(--mat-slide-toggle-state-layer-size, 40px);
}
.mdc-switch__ripple::after {
  content: "";
  opacity: 0;
}
.mdc-switch--disabled .mdc-switch__ripple::after {
  display: none;
}
.mat-mdc-slide-toggle-disabled-interactive .mdc-switch__ripple::after {
  display: block;
}
.mdc-switch:hover .mdc-switch__ripple::after {
  transition: 75ms opacity cubic-bezier(0, 0, 0.2, 1);
}
.mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:enabled:focus .mdc-switch__ripple::after, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:enabled:active .mdc-switch__ripple::after, .mat-mdc-slide-toggle-disabled-interactive.mdc-switch--disabled:enabled:hover:not(:focus) .mdc-switch__ripple::after, .mdc-switch--unselected:enabled:hover:not(:focus) .mdc-switch__ripple::after {
  background: var(--mat-slide-toggle-unselected-hover-state-layer-color, var(--mat-sys-on-surface));
  opacity: var(--mat-slide-toggle-unselected-hover-state-layer-opacity, var(--mat-sys-hover-state-layer-opacity));
}
.mdc-switch--unselected:enabled:focus .mdc-switch__ripple::after {
  background: var(--mat-slide-toggle-unselected-focus-state-layer-color, var(--mat-sys-on-surface));
  opacity: var(--mat-slide-toggle-unselected-focus-state-layer-opacity, var(--mat-sys-focus-state-layer-opacity));
}
.mdc-switch--unselected:enabled:active .mdc-switch__ripple::after {
  background: var(--mat-slide-toggle-unselected-pressed-state-layer-color, var(--mat-sys-on-surface));
  opacity: var(--mat-slide-toggle-unselected-pressed-state-layer-opacity, var(--mat-sys-pressed-state-layer-opacity));
  transition: opacity 75ms linear;
}
.mdc-switch--selected:enabled:hover:not(:focus) .mdc-switch__ripple::after {
  background: var(--mat-slide-toggle-selected-hover-state-layer-color, var(--mat-sys-primary));
  opacity: var(--mat-slide-toggle-selected-hover-state-layer-opacity, var(--mat-sys-hover-state-layer-opacity));
}
.mdc-switch--selected:enabled:focus .mdc-switch__ripple::after {
  background: var(--mat-slide-toggle-selected-focus-state-layer-color, var(--mat-sys-primary));
  opacity: var(--mat-slide-toggle-selected-focus-state-layer-opacity, var(--mat-sys-focus-state-layer-opacity));
}
.mdc-switch--selected:enabled:active .mdc-switch__ripple::after {
  background: var(--mat-slide-toggle-selected-pressed-state-layer-color, var(--mat-sys-primary));
  opacity: var(--mat-slide-toggle-selected-pressed-state-layer-opacity, var(--mat-sys-pressed-state-layer-opacity));
  transition: opacity 75ms linear;
}

.mdc-switch__icons {
  position: relative;
  height: 100%;
  width: 100%;
  z-index: 1;
  transform: translateZ(0);
}
.mdc-switch--disabled.mdc-switch--unselected .mdc-switch__icons {
  opacity: var(--mat-slide-toggle-disabled-unselected-icon-opacity, 0.38);
}
.mdc-switch--disabled.mdc-switch--selected .mdc-switch__icons {
  opacity: var(--mat-slide-toggle-disabled-selected-icon-opacity, 0.38);
}

.mdc-switch__icon {
  bottom: 0;
  left: 0;
  margin: auto;
  position: absolute;
  right: 0;
  top: 0;
  opacity: 0;
  transition: opacity 30ms 0ms cubic-bezier(0.4, 0, 1, 1);
}
.mdc-switch--unselected .mdc-switch__icon {
  width: var(--mat-slide-toggle-unselected-icon-size, 16px);
  height: var(--mat-slide-toggle-unselected-icon-size, 16px);
  fill: var(--mat-slide-toggle-unselected-icon-color, var(--mat-sys-surface-variant));
}
.mdc-switch--unselected.mdc-switch--disabled .mdc-switch__icon {
  fill: var(--mat-slide-toggle-disabled-unselected-icon-color, var(--mat-sys-surface-variant));
}
.mdc-switch--selected .mdc-switch__icon {
  width: var(--mat-slide-toggle-selected-icon-size, 16px);
  height: var(--mat-slide-toggle-selected-icon-size, 16px);
  fill: var(--mat-slide-toggle-selected-icon-color, var(--mat-sys-on-primary-container));
}
.mdc-switch--selected.mdc-switch--disabled .mdc-switch__icon {
  fill: var(--mat-slide-toggle-disabled-selected-icon-color, var(--mat-sys-on-surface));
}

.mdc-switch--selected .mdc-switch__icon--on,
.mdc-switch--unselected .mdc-switch__icon--off {
  opacity: 1;
  transition: opacity 45ms 30ms cubic-bezier(0, 0, 0.2, 1);
}

.mat-mdc-slide-toggle {
  -webkit-user-select: none;
  user-select: none;
  display: inline-block;
  -webkit-tap-highlight-color: transparent;
  outline: 0;
}
.mat-mdc-slide-toggle .mat-mdc-slide-toggle-ripple,
.mat-mdc-slide-toggle .mdc-switch__ripple::after {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.mat-mdc-slide-toggle .mat-mdc-slide-toggle-ripple:not(:empty),
.mat-mdc-slide-toggle .mdc-switch__ripple::after:not(:empty) {
  transform: translateZ(0);
}
.mat-mdc-slide-toggle.mat-mdc-slide-toggle-focused .mat-focus-indicator::before {
  content: "";
}
.mat-mdc-slide-toggle .mat-internal-form-field {
  color: var(--mat-slide-toggle-label-text-color, var(--mat-sys-on-surface));
  font-family: var(--mat-slide-toggle-label-text-font, var(--mat-sys-body-medium-font));
  line-height: var(--mat-slide-toggle-label-text-line-height, var(--mat-sys-body-medium-line-height));
  font-size: var(--mat-slide-toggle-label-text-size, var(--mat-sys-body-medium-size));
  letter-spacing: var(--mat-slide-toggle-label-text-tracking, var(--mat-sys-body-medium-tracking));
  font-weight: var(--mat-slide-toggle-label-text-weight, var(--mat-sys-body-medium-weight));
}
.mat-mdc-slide-toggle .mat-ripple-element {
  opacity: 0.12;
}
.mat-mdc-slide-toggle .mat-focus-indicator::before {
  border-radius: 50%;
}
.mat-mdc-slide-toggle._mat-animation-noopable .mdc-switch__handle-track,
.mat-mdc-slide-toggle._mat-animation-noopable .mdc-switch__icon,
.mat-mdc-slide-toggle._mat-animation-noopable .mdc-switch__handle::before,
.mat-mdc-slide-toggle._mat-animation-noopable .mdc-switch__handle::after,
.mat-mdc-slide-toggle._mat-animation-noopable .mdc-switch__track::before,
.mat-mdc-slide-toggle._mat-animation-noopable .mdc-switch__track::after {
  transition: none;
}
.mat-mdc-slide-toggle .mdc-switch:enabled + .mdc-label {
  cursor: pointer;
}
.mat-mdc-slide-toggle .mdc-switch--disabled + label {
  color: var(--mat-slide-toggle-disabled-label-text-color, var(--mat-sys-on-surface));
}
.mat-mdc-slide-toggle label:empty {
  display: none;
}

.mat-mdc-slide-toggle-touch-target {
  position: absolute;
  top: 50%;
  left: 50%;
  height: var(--mat-slide-toggle-touch-target-size, 48px);
  width: 100%;
  transform: translate(-50%, -50%);
  display: var(--mat-slide-toggle-touch-target-display, block);
}
[dir=rtl] .mat-mdc-slide-toggle-touch-target {
  left: auto;
  right: 50%;
  transform: translate(50%, -50%);
}
`],encapsulation:2,changeDetection:0})}return r})(),ge=(()=>{class r{static \u0275fac=function(n){return new(n||r)};static \u0275mod=_({type:r});static \u0275inj=b({imports:[E,C]})}return r})();var he=class r{darkMode=!1;notifications=!0;autoRefresh=!0;refreshInterval=30;static \u0275fac=function(e){return new(e||r)};static \u0275cmp=m({type:r,selectors:[["app-settings"]],decls:105,vars:4,consts:[[1,"page-settings"],[1,"profile-header"],[1,"avatar"],[1,"profile-info"],[1,"profile-name"],[1,"profile-id"],[1,"chevron",2,"color","rgba(255,255,255,0.5)"],[1,"asset-strip","wechat-group"],[1,"strip-item"],[1,"strip-value"],[1,"strip-label"],[1,"strip-divider"],[1,"strip-value","stock-up"],[1,"wechat-group-label"],[1,"wechat-group"],[1,"wechat-cell"],[1,"cell-icon",2,"background","#07c160"],[1,"cell-body"],[1,"cell-title"],[1,"chevron",2,"color","#c8c8cd"],[1,"cell-icon",2,"background","#fa8c16"],[1,"cell-icon",2,"background","#1890ff"],[1,"cell-icon",2,"background","#52c41a"],[1,"cell-right"],["color","primary",3,"ngModelChange","ngModel"],[1,"cell-icon",2,"background","#722ed1"],[1,"cell-icon",2,"background","#13c2c2"],[1,"cell-desc"],[1,"cell-icon",2,"background","#8c8c8c"],[2,"font-size","13px","color","#999"]],template:function(e,n){e&1&&(t(0,"div",0)(1,"div",1)(2,"div",2)(3,"mat-icon"),d(4,"person"),a()(),t(5,"div",3)(6,"div",4),d(7,"\u6295\u8D44\u8005"),a(),t(8,"div",5),d(9,"\u8D26\u53F7\uFF1Ainvest_user_001"),a()(),t(10,"mat-icon",6),d(11,"chevron_right"),a()(),t(12,"div",7)(13,"div",8)(14,"div",9),d(15,"532,680"),a(),t(16,"div",10),d(17,"\u603B\u8D44\u4EA7\uFF08\u5143\uFF09"),a()(),l(18,"div",11),t(19,"div",8)(20,"div",12),d(21,"+3,420"),a(),t(22,"div",10),d(23,"\u4ECA\u65E5\u76C8\u4E8F"),a()(),l(24,"div",11),t(25,"div",8)(26,"div",12),d(27,"+0.65%"),a(),t(28,"div",10),d(29,"\u4ECA\u65E5\u6536\u76CA\u7387"),a()()(),t(30,"div",13),d(31,"\u6211\u7684\u670D\u52A1"),a(),t(32,"div",14)(33,"div",15)(34,"div",16)(35,"mat-icon"),d(36,"bar_chart"),a()(),t(37,"div",17)(38,"div",18),d(39,"\u6536\u76CA\u62A5\u544A"),a()(),t(40,"mat-icon",19),d(41,"chevron_right"),a()(),t(42,"div",15)(43,"div",20)(44,"mat-icon"),d(45,"swap_horiz"),a()(),t(46,"div",17)(47,"div",18),d(48,"\u4EA4\u6613\u8BB0\u5F55"),a()(),t(49,"mat-icon",19),d(50,"chevron_right"),a()(),t(51,"div",15)(52,"div",21)(53,"mat-icon"),d(54,"favorite"),a()(),t(55,"div",17)(56,"div",18),d(57,"\u81EA\u9009\u80A1"),a()(),t(58,"mat-icon",19),d(59,"chevron_right"),a()()(),t(60,"div",13),d(61,"\u8BBE\u7F6E"),a(),t(62,"div",14)(63,"div",15)(64,"div",22)(65,"mat-icon"),d(66,"notifications"),a()(),t(67,"div",17)(68,"div",18),d(69,"\u884C\u60C5\u901A\u77E5"),a()(),t(70,"div",23)(71,"mat-slide-toggle",24),x("ngModelChange",function(c){return k(n.notifications,c)||(n.notifications=c),c}),a()()(),t(72,"div",15)(73,"div",25)(74,"mat-icon"),d(75,"dark_mode"),a()(),t(76,"div",17)(77,"div",18),d(78,"\u6DF1\u8272\u6A21\u5F0F"),a()(),t(79,"div",23)(80,"mat-slide-toggle",24),x("ngModelChange",function(c){return k(n.darkMode,c)||(n.darkMode=c),c}),a()()(),t(81,"div",15)(82,"div",26)(83,"mat-icon"),d(84,"sync"),a()(),t(85,"div",17)(86,"div",18),d(87,"\u81EA\u52A8\u5237\u65B0"),a(),t(88,"div",27),d(89),a()(),t(90,"div",23)(91,"mat-slide-toggle",24),x("ngModelChange",function(c){return k(n.autoRefresh,c)||(n.autoRefresh=c),c}),a()()()(),t(92,"div",14)(93,"div",15)(94,"div",28)(95,"mat-icon"),d(96,"info"),a()(),t(97,"div",17)(98,"div",18),d(99,"\u5173\u4E8E\u6295\u8D44\u52A9\u624B"),a()(),t(100,"div",23)(101,"span",29),d(102,"v0.0.1"),a(),t(103,"mat-icon",19),d(104,"chevron_right"),a()()()()()),e&2&&(o(71),y("ngModel",n.notifications),o(9),y("ngModel",n.darkMode),o(9),X("\u6BCF ",n.refreshInterval," \u79D2"),o(2),y("ngModel",n.autoRefresh))},dependencies:[se,Y,Z,le,ge,E,ce,oe,te,$,ee],styles:[".page-settings[_ngcontent-%COMP%]{padding-bottom:24px}.profile-header[_ngcontent-%COMP%]{background:var(--wechat-green);display:flex;align-items:center;padding:24px 16px 20px;gap:14px;cursor:pointer}.profile-header[_ngcontent-%COMP%]   .avatar[_ngcontent-%COMP%]{width:56px;height:56px;border-radius:10px;background:#ffffff40;display:flex;align-items:center;justify-content:center;flex-shrink:0}.profile-header[_ngcontent-%COMP%]   .avatar[_ngcontent-%COMP%]   mat-icon[_ngcontent-%COMP%]{font-size:32px;width:32px;height:32px;color:#fff}.profile-header[_ngcontent-%COMP%]   .profile-info[_ngcontent-%COMP%]{flex:1}.profile-header[_ngcontent-%COMP%]   .profile-info[_ngcontent-%COMP%]   .profile-name[_ngcontent-%COMP%]{font-size:18px;font-weight:600;color:#fff;margin-bottom:4px}.profile-header[_ngcontent-%COMP%]   .profile-info[_ngcontent-%COMP%]   .profile-id[_ngcontent-%COMP%]{font-size:13px;color:#ffffffbf}.asset-strip[_ngcontent-%COMP%]{display:flex;margin-bottom:8px}.asset-strip[_ngcontent-%COMP%]   .strip-item[_ngcontent-%COMP%]{flex:1;display:flex;flex-direction:column;align-items:center;padding:14px 8px}.asset-strip[_ngcontent-%COMP%]   .strip-item[_ngcontent-%COMP%]   .strip-value[_ngcontent-%COMP%]{font-size:16px;font-weight:600;color:var(--wechat-text)}.asset-strip[_ngcontent-%COMP%]   .strip-item[_ngcontent-%COMP%]   .strip-label[_ngcontent-%COMP%]{font-size:11px;color:var(--wechat-text-secondary);margin-top:3px}.asset-strip[_ngcontent-%COMP%]   .strip-divider[_ngcontent-%COMP%]{width:1px;background:var(--wechat-divider);margin:10px 0}"]})};export{he as SettingsComponent};
