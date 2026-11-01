import Link from 'next/link';
import {ArrowUpRight,Compass,LockKeyhole} from 'lucide-react';
import PassengerExperience from '../components/PassengerExperience';
import styles from './PassengerDemoShell.module.css';

export default function PassengerDemoPage(){
 return <main className={styles.page}>
  <div className={styles.ambient} aria-hidden="true"/>
  <div className={styles.container}>
   <header className={styles.header}>
    <Link className={styles.brand} href="/passenger-demo" aria-label="AERVELYS Passenger Experience Startseite">
     <span className={styles.brandSymbol}>A</span><span><strong>AERVELYS</strong><small>PRIVATE AVIATION · NEXT</small></span>
    </Link>
    <nav aria-label="Passagiermenü" className={styles.nav}>
     <span className={styles.preview}><span/> PUBLIC DEMO</span>
     <Link className={styles.setupLink} href="/passenger-demo/setup"><Compass size={16}/> Pilot / Flight Planning <ArrowUpRight size={15}/></Link>
    </nav>
   </header>
   <PassengerExperience publicDemo/>
   <footer className={styles.footer}><span>© AERVELYS · NEXT EXPERIENCE STUDIO</span><span><LockKeyhole size={13}/> Geschützte OPS-Daten werden hier nicht geladen · Alle Flugbewegungen sind simuliert</span></footer>
  </div>
 </main>;
}
