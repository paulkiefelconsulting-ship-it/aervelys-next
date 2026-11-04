import type {Metadata} from 'next';
import V2AirlineCockpit from './V2AirlineCockpit';
export const metadata:Metadata={title:'AERVELYS NEXT 2.0 | Virtual Business Airline',description:'AERVELYS 2.0 – eigenständige virtuelle Business-Airline mit Sales, Dispatch, Flügen und Finance.'};
export default function AirlineV2(){return <V2AirlineCockpit/>;}
