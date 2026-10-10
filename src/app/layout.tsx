import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SWRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CalcCraft — Превратите расчеты Genshin Impact в искусство.",
  description:
    "Удобная визуализация, сортировка и генерация эстетичных карточек из ваших расчетных таблиц Genshin Impact: загрузка xlsx, CSV или ссылки на лист Google-таблицы, парсинг в браузере, офлайн-режим PWA.",
  keywords: ["CalcCraft", "Genshin Impact", "Showcase", "DPR", "DPS", "ротации", "парсер"],
};

export const viewport: Viewport = {
  themeColor: "#141c2b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      data-el="on"
      data-rar="off"
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var sv=localStorage.getItem("showcase-view");if(sv==="rows"||sv==="compact")document.documentElement.setAttribute("data-flash-view",sv)}catch(e){}' +
              'try{var sd=localStorage.getItem("showcase-display");if(sd){var dd=JSON.parse(sd);if(dd&&typeof dd.el==="boolean")document.documentElement.setAttribute("data-el",dd.el?"on":"off");if(dd&&typeof dd.rar==="boolean")document.documentElement.setAttribute("data-rar",dd.rar?"on":"off")}}catch(e){}' +
            'try{(function(){var R=function(k){try{return localStorage.getItem(k)}catch(e){return null}};var dh=R("showcase-demo-hidden")==="1";var C=null;try{C=JSON.parse(R("showcase-cache-v2")||R("showcase-cache-v1")||"null")}catch(e){}var F=null;try{F=JSON.parse(R("showcase-favorites")||"null")}catch(e){}var S=[],AK=[];if(C&&C.v===2&&Array.isArray(C.sources)){S=C.sources.filter(function(s){return s&&typeof s.key==="string"&&typeof s.seq==="number"&&s.seq>0}).sort(function(a,b){return a.seq-b.seq});AK=Array.isArray(C.activeKeys)?C.activeKeys.filter(function(k){return typeof k==="string"&&S.some(function(s){return s.key===k})}):[]}else if(C&&C.v===1&&Array.isArray(C.sources)){S=C.sources.filter(function(s){return s&&typeof s.key==="string"&&typeof s.saved_at==="number"}).sort(function(a,b){return a.saved_at-b.saved_at}).map(function(s,i){return{key:s.key,label:s.label,seq:i+1,name:""}});AK=typeof C.activeKey==="string"&&S.some(function(s){return s.key===C.activeKey})?[C.activeKey]:[]}var FI=(F&&Array.isArray(F.items))?F.items.filter(function(f){return f&&typeof f.uid==="string"&&typeof f.srcName==="string"&&f.team&&typeof f.team==="object"&&Array.isArray(f.team.characters)&&typeof f.team.slot==="string"&&/^R[1-9][0-9]*·C[1-9][0-9]*$/.test(f.team.slot)}):[];var favOn=!!(F&&F.on===true&&FI.length>0);var ph=dh||AK.length>0||favOn;if(ph){document.documentElement.setAttribute("data-prehide","1");setTimeout(function(){document.documentElement.removeAttribute("data-prehide");document.documentElement.removeAttribute("data-cache-row")},4000)}if(S.length>0)document.documentElement.setAttribute("data-cache-row","1");if(dh)document.documentElement.setAttribute("data-demo-off","1");var ch=S.filter(function(s){return AK.indexOf(s.key)>=0});var parts=[];if(favOn)parts.push("избранное");if(ch.length===1&&!favOn)parts.push(ch[0].name?("#"+ch[0].seq+" · "+ch[0].name):("#"+ch[0].seq));else for(var i=0;i<ch.length;i++)parts.push("#"+ch[i].seq);var chip=parts.length?parts.join(", "):(dh?"—":"демо");var n=ch.length+(favOn?1:0),lbl;if(n===0)lbl=dh?"демо скрыто":"Демо: Showcase · Timmie'+"'"+'s Bird";else if(favOn&&ch.length===0)lbl="Избранное";else if(!favOn&&ch.length===1)lbl=ch[0].label;else{var o=[];if(favOn)o.push("избранное");for(i=0;i<ch.length;i++)o.push("#"+ch[i].seq);var a=n%10,b=n%100,pl=(a===1&&b!==11)?"источник":((a>=2&&a<=4&&(b<12||b>14))?"источника":"источников");lbl=n+" "+pl+": "+o.join(", ")}if(chip!=="демо"||lbl!=="Демо: Showcase · Timmie'+"'"+'s Bird"){var E=function(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")};var w=function(){var b1=document.querySelector("[data-chip-label]"),b2=document.querySelector("[data-src-label]"),b3=document.querySelector("[data-notice-line]");if(!b1||!b2)return false;b1.innerHTML=E(chip);b2.innerHTML=E(lbl);if(AK.length>0&&b3)b3.textContent=" · восстановлено из кэша — работает офлайн";return true};if(document.readyState==="loading"){var m=new MutationObserver(function(){if(w())m.disconnect()});m.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){m.disconnect()},4000)}else w()}})()}catch(e){}' +
            'try{(function(){var R=function(k){try{return localStorage.getItem(k)}catch(e){return null}};var L={"order":"по порядку","dps":"DPS","dpr":"DPR","time":"время ротации"};var T=null;try{T=JSON.parse(R("showcase-sort")||"null")}catch(e){}if(T&&typeof T==="object"){var mo=(typeof T.mode==="string"&&L[T.mode])?T.mode:"order";var di=(T.dir==="asc"||T.dir==="desc")?T.dir:"asc";var txt=L[mo]+" "+(di==="asc"?"↑":"↓");if(txt!=="по порядку ↑"){var E=function(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")};var w=function(){var b=document.querySelector("[data-sort-label]");if(!b)return false;b.innerHTML=E(txt);return true};if(document.readyState==="loading"){var m=new MutationObserver(function(){if(w())m.disconnect()});m.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){m.disconnect()},4000)}else w()}}})()}catch(e){}' +
              'try{if(window.CSS&&CSS.supports&&CSS.supports("-moz-appearance","none"))document.documentElement.style.scrollbarColor="#3d4d6d transparent"}catch(e){}',
          }}
        />
        {children}
        <SWRegister />
        <Toaster />
      </body>
    </html>
  );
}
