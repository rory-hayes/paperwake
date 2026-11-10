export const PLANS = [
  {id:'explore',name:'Free evaluation',monthlyPrice:0,monthlyPages:10,maxParsers:1,maxConcurrent:1,features:['10 pages, once','Invoice review and CSV export','No card required']},
  {id:'standard',name:'Paperwake',monthlyPrice:49,monthlyPages:500,maxParsers:1,maxConcurrent:2,features:['500 pages per billing period','Invoice fields and line items','Review, approve and export CSV','Cancel through your billing portal']},
] as const;
