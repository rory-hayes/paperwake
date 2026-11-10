import {Navigate,useSearchParams} from 'react-router-dom';
/** Keep existing bookmarks and provider return URLs pointed at the launch billing screen. */
export default function Usage(){const [params]=useSearchParams();const next=new URLSearchParams(params);next.set('tab','billing');return <Navigate replace to={`/app/settings?${next.toString()}`}/>;}
