'use client';
import {ExternalLink,Route} from 'lucide-react';
import {simbriefUrlForLeg,type SimBriefLeg} from './simbriefDispatch';
import styles from './V2SimbriefButton.module.css';
export default function V2SimbriefButton({leg}:{leg:SimBriefLeg}){
 const url=simbriefUrlForLeg(leg);
 if(!url)return <span className={styles.unavailable}>SimBrief-Typ noch nicht zugeordnet</span>;
 return <div className={styles.wrap}>
  <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
   <Route size={16}/> SimBrief-Flugplanung vorbereiten <ExternalLink size={14}/>
  </a>
  <small>Überträgt Route (Start/Ziel), Flugzeugtyp, PAX, Abflugzeit (UTC) und geplante Blockzeit. SimBrief prüft und erstellt den OFP erst nach deiner Anmeldung und Bestätigung. Nicht bestätigte Kennzeichen oder Routen werden nicht erfunden.</small>
 </div>;
}
