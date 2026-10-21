"use client"

import { useLayoutEffect, useState, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { HubClientError } from "@/hub/client"
import type { ManagedPersonalSkill, CatalogPackageData } from "@/hub/schemas"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import type { PersonalSkillHistoryPage, PersonalSkillHistoryVersion } from "@/hub/personal-skill-history.schema"
import { inspectManagedSkillPackage } from "@/hub/skill-installation-content"
import { useLocale } from "@/i18n/context"
import { SkillPackageDocument } from "./skill-package-document"
import { SkillPackageFiles } from "./skill-package-files"
import styles from "./personal-skill-history-dialog.module.css"

type Read<T>={data?:T;error?:unknown}
/** Read-only history. A selected revision never becomes a publication or installation write. */
export function PersonalSkillHistoryDialog({base,client,open,onOpenChange,returnFocusRef}: {
 base:ManagedPersonalSkill; client:Pick<SkillPublishClient,"listHistory">;open:boolean;onOpenChange:(open:boolean)=>void;returnFocusRef:RefObject<HTMLInputElement|null>
}){
 const {t,locale}=useLocale()
 const [attempt,setAttempt]=useState(0),[page,setPage]=useState<Read<PersonalSkillHistoryPage>>({})
 const [selected,setSelected]=useState<PersonalSkillHistoryVersion|null>(null)
 const [more,setMore]=useState<{busy:boolean;error?:unknown}>({busy:false})
 const [continuation,setContinuation]=useState<{cursor:string;before:PersonalSkillHistoryPage}|null>(null)
 useLayoutEffect(()=>{
  if(!open)return
  const controller=new AbortController()
  void client.listHistory(base.skill_id,undefined,controller.signal).then(data=>{
   if(controller.signal.aborted)return
   if(data.series_id!==base.series_id)throw new Error("History series mismatch")
   setPage({data});setSelected(data.versions.find(v=>v.is_current)??data.versions[0]??null)
  }).catch(error=>{if(!controller.signal.aborted)setPage({error})})
  return ()=>controller.abort()
 },[open,base.skill_id,base.series_id,client,attempt])
 useLayoutEffect(()=>{
  if(!open||continuation===null)return
  const {cursor,before}=continuation,controller=new AbortController()
  void client.listHistory(base.skill_id,cursor,controller.signal).then(data=>{
   if(controller.signal.aborted)return
   if(data.series_id!==before.series_id||JSON.stringify(data.publication)!==JSON.stringify(before.publication)||data.next_cursor===cursor||data.next_cursor!==null&&data.versions.length===0)throw new Error("History snapshot changed")
   const versions=[...before.versions,...data.versions]
   if(new Set(versions.map(v=>v.skill_id)).size!==versions.length||versions.some((v,i)=>i>0&&BigInt(v.revision)>=BigInt(versions[i-1]!.revision)))throw new Error("History continuation overlaps")
   setPage({data:{...before,versions,next_cursor:data.next_cursor}});setMore({busy:false});setContinuation(null)
  }).catch(error=>{if(!controller.signal.aborted){setMore({busy:false,error});setContinuation(null)}})
  return ()=>controller.abort()
 },[open,continuation,base.skill_id,client])
 const refresh=()=>{setPage({});setSelected(null);setMore({busy:false});setContinuation(null);setAttempt(v=>v+1)}
 const retryMore=()=>{if(page.data?.next_cursor){setMore({busy:true});setContinuation({cursor:page.data.next_cursor,before:page.data})}}
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className={styles.dialog} onCloseAutoFocus={event=>{event.preventDefault();returnFocusRef.current?.focus()}}>
   <header className={styles.heading}><DialogTitle>{t("skills.history.title")}</DialogTitle><DialogDescription className="sr-only">{base.name}</DialogDescription></header>
   <section className={styles.versions} aria-label={t("skills.history.title")}>
    {!page.data&&!page.error?<div aria-busy="true" className="h-20 rounded-lg bg-muted"/>:null}
    {page.error?<div role="alert">{t("skills.history.failed")}<Button onClick={refresh}>{t("skills.retry")}</Button></div>:null}
    {page.data?.versions.length===0?<p>{t("skills.history.empty")}</p>:null}
    {page.data?.versions.map(version=><button type="button" key={version.skill_id} className={styles.version} aria-pressed={selected?.skill_id===version.skill_id} onClick={()=>setSelected(version)}>
     {version.is_current?<span className={styles.current}>{t("skills.history.current")}</span>:null}
     <span>{new Intl.DateTimeFormat(locale,{hour:"numeric",minute:"2-digit"}).format(new Date(version.created_at))}</span><span className="sr-only">{t("skills.history.revision")} {version.revision}</span>
    </button>)}
    {more.error?<p role="alert">{t("skills.history.pageFailed")}<Button variant="ghost" onClick={refresh}>{t("skills.history.refresh")}</Button></p>:null}
    {page.data?.next_cursor?<Button variant="ghost" disabled={more.busy} onClick={retryMore}>{t("skills.history.more")}</Button>:null}
   </section>
   {selected?<HistoryPackage key={selected.skill_id} version={selected}/>:null}
  </DialogContent>
 </Dialog>
}

function HistoryPackage({version}:{version:PersonalSkillHistoryVersion}){
 const {t}=useLocale()
 const [directory,setDirectory]=useState<Read<CatalogPackageData>>({}),[document,setDocument]=useState<Read<CatalogPackageData>>({})
 const [attempt,setAttempt]=useState(0),[fileAttempt,setFileAttempt]=useState(0),[file,setFile]=useState<string|null>(null),[showFiles,setShowFiles]=useState(false)
 const [expanded,setExpanded]=useState<ReadonlySet<string>>(new Set())
 useLayoutEffect(()=>{
  const controller=new AbortController()
  void inspectManagedSkillPackage(version,undefined,controller.signal).then(data=>{
   if(controller.signal.aborted)return
   setDirectory({data});setFile(data.files.find(v=>v.path==="SKILL.md")?.path??data.files[0]?.path??null)
  }).catch(error=>{if(!controller.signal.aborted)setDirectory({error})})
  return ()=>controller.abort()
 },[version,attempt])
 useLayoutEffect(()=>{
  if(!file||!directory.data)return
  const controller=new AbortController()
  void inspectManagedSkillPackage(version,file,controller.signal,directory.data).then(data=>{if(!controller.signal.aborted)setDocument({data})}).catch(error=>{if(!controller.signal.aborted)setDocument({error})})
  return ()=>controller.abort()
 },[version,file,directory.data,fileAttempt])
 const unavailable=(read:Read<CatalogPackageData>)=>read.error instanceof HubClientError&&[403,404,412].includes(read.error.status??0)
 return <section className={styles.package}>
  <header className={styles.packageHeader}><strong>{version.name}</strong><span>{version.file_count} {t("skills.history.files")} · {version.archive_size} B</span>
   {directory.data&&directory.data.files.length>1?<Button variant="ghost" aria-expanded={showFiles} onClick={()=>setShowFiles(v=>!v)}>{t("skills.detailFiles")}</Button>:null}
  </header>
  <div className={styles.preview}>
   {showFiles&&directory.data?<ul className={styles.files}><SkillPackageFiles files={directory.data.files} selectedPath={file} expandedFolders={expanded} onToggle={path=>setExpanded(current=>{const next=new Set(current);if(!next.delete(path))next.add(path);return next})} onSelect={path=>{if(path!==file){setDocument({});setFile(path)}setShowFiles(false)}}/></ul>:null}
   {directory.error?<p role="alert">{t(unavailable(directory)?"skills.history.unavailable":"skills.history.failed")}<Button onClick={()=>{setDirectory({});setAttempt(v=>v+1)}}>{t("skills.retry")}</Button></p>:null}
   {document.error?<p role="alert">{t(unavailable(document)?"skills.history.unavailable":"skills.history.failed")}<Button onClick={()=>{setDocument({});setFileAttempt(v=>v+1)}}>{t("skills.retry")}</Button></p>:null}
   {document.data?.selected_file?<SkillPackageDocument text={document.data.selected_file.text}/>:null}
   {!directory.error&&!document.error&&!document.data&&(directory.data?.files.length!==0)?<div aria-busy="true" className="h-24 rounded-lg bg-muted"/>:null}
   {directory.data?.files.length===0?<p>{t("skills.history.emptyFiles")}</p>:null}
  </div>
 </section>
}
