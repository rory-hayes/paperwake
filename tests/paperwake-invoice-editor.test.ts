import test from 'node:test';
import assert from 'node:assert/strict';
import type {SchemaField} from '../shared/types';
import {normalizeEditorValues} from '../src/features/documents/value-editing';

const fields:SchemaField[]=[
  {key:'invoice_number',label:'Invoice number',type:'string'},
  {key:'total',label:'Total',type:'currency'},
  {key:'line_items',label:'Line items',type:'array',fields:[
    {key:'product_code',label:'Product code',type:'string'},
    {key:'quantity',label:'Quantity',type:'number'},
    {key:'unit_price',label:'Unit price',type:'currency'},
  ]},
];

test('invoice corrections preserve exact decimals and leading-zero identifiers through nested rows',()=>{
  const draft={invoice_number:'000001234567890123456789',total:'9007199254740993.07',line_items:[{product_code:'00001234',quantity:'0.1250',unit_price:' 12.3400 '}]};
  assert.deepEqual(normalizeEditorValues(draft,fields,{decimalStrings:true}),{
    invoice_number:'000001234567890123456789',total:'9007199254740993.07',
    line_items:[{product_code:'00001234',quantity:'0.1250',unit_price:'12.3400'}],
  });
  assert.equal(draft.line_items[0].unit_price,' 12.3400 ');
});

test('invoice corrections distinguish missing values and explicit zero without coercing invalid drafts',()=>{
  for(const total of ['-','1.2.3','1e999','Infinity','€12.50']){
    assert.equal(normalizeEditorValues({total},fields,{decimalStrings:true}).total,total);
  }
  assert.equal(normalizeEditorValues({total:'  '},fields,{decimalStrings:true}).total,null);
  assert.equal(normalizeEditorValues({total:'0.00'},fields,{decimalStrings:true}).total,'0.00');
  assert.equal(normalizeEditorValues({total:0},fields,{decimalStrings:true}).total,'0');
});
