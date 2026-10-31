import PassengerExperience from '../components/PassengerExperience';

export default function PassengerDemoPage() {
  return (
    <main style={{minHeight:'100vh',background:'#091524',padding:'clamp(16px,3vw,40px)'}}> 
      <div style={{maxWidth:1400,margin:'0 auto'}}> 
        <header style={{display:'flex',justifyContent:'space-between',gap:14,paddingBottom:22,marginBottom:20,borderBottom:'1px solid #29445d',flexWrap:'wrap'}}> 
          <strong style={{color:'#f0f8ff',letterSpacing:3}}>AERVELYS NEXT</strong>
          <span style={{color:'#7ce5db',fontSize:12}}>PASSENGER EXPERIENCE · DEMO</span>
        </header>
        <PassengerExperience publicDemo={true}/>
      </div>
    </main>
  );
}
