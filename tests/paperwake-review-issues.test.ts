import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReviewChecks from '../src/features/documents/ReviewChecks';
import {currentReviewIssues,invoiceApprovalState} from '../src/features/documents/review-issues';

test('corrected invoice currency and table-size checks disappear while source warnings survive',()=>{
  const sourceWarning={field:'supplier',code:'uncertain_extraction',message:'Compare this supplier with the source.'};
  const original=[{field:'currency',code:'currency',message:'Use a currency code.'},{field:'line_items',code:'table_limit',message:'Too many rows.'},sourceWarning];
  assert.deepEqual(currentReviewIssues(original,[]),[sourceWarning]);
  const remaining={field:'total',code:'total',message:'Check the total.'};
  assert.deepEqual(currentReviewIssues(original,[remaining]),[sourceWarning,remaining]);
  assert.equal(original.length,3);
});

test('current invoice validation is shown once and an absent validation response retains original issues',()=>{
  const issue={field:'total',code:'number',message:'Use a decimal amount.'};
  assert.deepEqual(currentReviewIssues([issue],[issue]),[issue]);
  assert.deepEqual(currentReviewIssues([issue]),[issue]);
});

test('totals warnings require acknowledgement of the saved revision and cannot bypass structural errors',()=>{
  const warning={field:'total',code:'total',message:'Check the original for adjustments.',severity:'warning' as const};
  const state={revision:'correction:a',acknowledgedRevision:null as string|null,dirty:false,stale:false};
  assert.equal(invoiceApprovalState([warning],state).canApprove,false);
  assert.equal(invoiceApprovalState([warning],{...state,acknowledgedRevision:'correction:a'}).canApprove,true);
  for(const changed of [{dirty:true},{stale:true},{revision:'correction:b'}])assert.equal(invoiceApprovalState([warning],{...state,acknowledgedRevision:'correction:a',...changed}).canApprove,false);
  const required={field:'invoice_date',code:'required',message:'Date is required.'};
  assert.equal(invoiceApprovalState([warning,required],{...state,acknowledgedRevision:'correction:a'}).canApprove,false);
  assert.equal(invoiceApprovalState([],state).canApprove,true);
  assert.equal(invoiceApprovalState([],{...state,dirty:true}).canApprove,false);
});

test('an ambiguous date warning is cleared only after a valid saved date resolves its current validation',()=>{
  const original=[{field:'invoice_date',code:'invoice_date_ambiguous',message:'Enter the original date.'}];
  assert.deepEqual(currentReviewIssues(original,[],{invoice_date:null}),original);
  assert.deepEqual(currentReviewIssues(original,[],{invoice_date:'2026-03-04'}),[]);
  const invalid={field:'invoice_date',code:'date',message:'Invalid date.'};
  assert.deepEqual(currentReviewIssues(original,[invalid],{invoice_date:'2026-99-99'}),[...original,invalid]);
});


test('large evidence gaps stay visible as a collapsed count without burying blocking value checks',()=>{
  const missing=Array.from({length:495},(_,index)=>({field:`line_items[${Math.floor(index/5)}].amount`,code:'evidence_missing',message:'No verified quote.'}));
  const html=renderToStaticMarkup(createElement(ReviewChecks,{issues:[...missing,{field:'invoice_date',code:'required',message:'Invoice date is required.'}]}));
  assert.match(html,/495 values have no verified source quote/);assert.match(html,/Line item 99, Line total/);
  assert.doesNotMatch(html,/<details[^>]*\bopen/);assert.ok(html.indexOf('Invoice date is required.')<html.indexOf('<details'));
});
