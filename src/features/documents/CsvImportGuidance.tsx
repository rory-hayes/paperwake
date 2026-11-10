export default function CsvImportGuidance(){
  return <p className="small muted">Use your spreadsheet’s import tool and set Invoice number and Product code columns to Text. Opening a CSV directly can remove leading zeroes or round long numbers. Import amounts and quantities as Text too if you need to retain their exact written precision.</p>;
}
