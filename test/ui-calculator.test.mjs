import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {calculate,bestCombination} from '../web/calculator.mjs';
async function calculator(matchOverride){
 const source=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');
 const fields=Object.fromEntries(['pay','full','ratio','rebate','threshold','percent','cap'].map(k=>[k,{_value:k==='full'||k==='ratio'?'0':'',get value(){return this._value;},set value(v){this._value=String(v);},disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;}}]));
 const output={textContent:''},reset={};const panel={querySelector(selector){if(selector==='output')return output;if(selector==='[data-reset]')return reset;return fields[selector.split(String.fromCharCode(34))[1]];}};
 const match=matchOverride??{full:{activities:[{minPay:30,rebate:20}]},ratio:{activities:[{ratioPercent:6,maxCashback:10}]}};
 runInNewContext(source.slice(source.indexOf('function bindCalculator'),source.indexOf('function previewLocation'))+';bindCalculator(match,0)',{$:()=>panel,calculate,bestCombination,match,money:v=>String(v)});
 return {fields,output,reset};
}
test('计算器界面：初始最低已知门槛，输入实际实付即重算',async()=>{const {fields,output}=await calculator();assert.equal(fields.pay.value,"30");assert.match(output.textContent,/净支出 ¥8.2/);fields.pay.value='40';fields.pay.events.input();assert.match(output.textContent,/净支出 ¥17.6/);});
test('计算器界面：用户清空实付后必须待填写，不偷偷回退门槛',async()=>{const {fields,output}=await calculator();fields.pay.value='';fields.pay.events.input();assert.match(output.textContent,/请填写/);assert.ok(!output.textContent.includes('净支出 ¥'));});

test('计算器界面：切换另一侧来源并返回时保留每份活动的手填值',async()=>{
 const match={full:{activities:[{minPay:null,rebate:null},{minPay:30,rebate:20}]},ratio:{activities:[{ratioPercent:6,maxCashback:10},{ratioPercent:50,maxCashback:8}]}};
 const {fields,output}=await calculator(match);fields.full.value='0';fields.full.events.change();fields.pay.value='30';fields.pay.events.input();fields.rebate.value='35';fields.rebate.events.input();fields.threshold.value='20';fields.threshold.events.input();fields.ratio.value='1';fields.ratio.events.change();assert.equal(fields.rebate.value,'35');assert.equal(fields.threshold.value,'20');assert.match(output.textContent,/净支出 ¥-13/);fields.full.value='1';fields.full.events.change();fields.full.value='0';fields.full.events.change();assert.equal(fields.rebate.value,'35');assert.equal(fields.threshold.value,'20');
});

test('歪麦满返缺会员金额：展示待填写而非固定返，保留最大阶梯警告',async()=>{const source=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');const renderer=source.slice(source.indexOf("'use strict'"),source.indexOf('function ratioActivities'));const rendered=runInNewContext(renderer+';fullActivities(store)',{store:{activities:[{source:'waimai',rebateType:'fixed',rebate:null,minPay:null,referenceGrade:{fullMoney:'50',rebateMoney:'40'},condition:'会员'}]}});assert.ok(!rendered.includes('固定返'));assert.match(rendered,/会员满返金额待填写/);assert.match(rendered,/不是最低门槛/);});

test('缺会员比例的选项仍标为比例返并显示待填写，不误标满返',async()=>{const source=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');const rendered=runInNewContext(source.slice(source.indexOf('function calculatorMarkup'),source.indexOf('function bindCalculator'))+';calculatorMarkup(match,0)',{bestCombination,money:v=>typeof v==='number'?String(v):'待核对',inventoryText:()=> '名额未知',sourceName:()=> '歪麦（会员口径）',esc:v=>String(v),match:{full:{activities:[{minPay:30,rebate:20}]},ratio:{activities:[{ratioPercent:null,maxCashback:10}]}}});const option=rendered.split('data-field="ratio"')[1].split('</select>')[0];assert.match(option,/会员比例待填写/);assert.ok(!option.includes('满¥'));assert.match(option,/封顶¥10/);});
