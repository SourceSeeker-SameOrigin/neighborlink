const api = require('../../utils/api');
const form = require('./form');
Page({
  data: { loading:true,saving:false,error:'',canReload:false,refreshCommunityId:'',refreshError:'',community:null,communities:[],communityIndex:0,authorized:false,priceRows:[],globalRows:[],keywordRows:[],planOptions:form.PLANS,
    helpModeIndex:0,helpModes:['按每15分钟计价','按次计价（超时不自动扣费）'],stations:[],dutyWindows:[],canteens:[],plans:[],recycleRows:[],buildingId:'',buildingName:'',buildingUnits:'',petCertRequired:false },
  onLoad(){return this.load();},
  onShow(){this.hidden=false;if(this.wasHidden){this.wasHidden=false;return this.load();}},
  onHide(){this.rememberDraft();this.hidden=true;this.wasHidden=true;this.sequence=(this.sequence||0)+1;this.loadSequence=(this.loadSequence||0)+1;this.clearPrivate();},
  onUnload(){this.closed=true;this.sequence=(this.sequence||0)+1;this.clearPrivate();},
  rememberDraft(){if(!this.currentAdmin()||!this.data.community)return;const keys=['name','city','district','address','propertyName','federationGroupId',
    'platformRate','propertyRate','location','locationText','petCertRequired','helpModeIndex','stations','canteens','dutyWindows',
    'priceRows','holidayDates','recycleRows','plans','buildingId','buildingName','buildingUnits','hotline','globalRows','keywordRows'];
    this.editDraft={ownerId:this.ownerId,communityId:this.data.community._id,data:Object.fromEntries(keys.map(key=>[key,this.data[key]]))};},
  clearPrivate(){this.setData({authorized:false,community:null,communities:[],priceRows:[],globalRows:[],keywordRows:[],
    stations:[],dutyWindows:[],canteens:[],plans:[],recycleRows:[],refreshCommunityId:''});this.ownerId=null;this.globalLoaded=false;},
  currentAdmin(sequence=this.sequence){const user=getApp().globalData.user;return !this.hidden&&!this.closed&&
    sequence===this.sequence&&!!this.ownerId&&user?._id===this.ownerId&&user.roles?.includes('admin');},
  async load() {
    const sequence=this.loadSequence=(this.loadSequence||0)+1;
    if(this.ownerId&&getApp().globalData.user?._id!==this.ownerId)this.clearPrivate();
    this.setData({loading:true,error:'',canReload:false,authorized:false});
    try { const user=await getApp().ensureSession();if(this.hidden||this.closed||sequence!==this.loadSequence||getApp().globalData.user?._id!==user._id)return;
      if(!user.roles.includes('admin'))throw new Error('只有运营管理员可以修改配置');
      this.ownerId=user._id;await this.selectCommunity(this.data.communityIndex);if(sequence===this.loadSequence&&this.currentAdmin()&&this.data.community)this.setData({authorized:true}); }
    catch(error){if(!this.hidden&&!this.closed&&sequence===this.loadSequence){this.clearPrivate();this.setData({error:error.message || '配置加载失败',canReload:true});}}
    finally{if(!this.hidden&&!this.closed&&sequence===this.loadSequence)this.setData({loading:false});}
  },
  async selectCommunity(index) {
    const sequence=(this.sequence||0)+1;this.sequence=sequence;
    const ownerId=this.ownerId;
    const result=await api.call('admin','managementConfig',{communityId:(this.data.communities[index]||{})._id||
      (this.editDraft?.ownerId===ownerId?this.editDraft.communityId:undefined)},{loading:false,silent:true});
    if(sequence!==this.sequence||this.hidden||this.closed||getApp().globalData.user?._id!==ownerId)return;
    const c=result.community,g=result.global;
    this.setData({refreshCommunityId:'',refreshError:'',communities:result.communities,community:c,communityIndex:Math.max(0,result.communities.findIndex(v=>c&&v._id===c._id))});
    if(!this.globalLoaded){this.globalLoaded=true;this.setData({hotline:g.hotline||'',globalRows:form.fields(form.GLOBAL_FIELDS,g),keywordRows:form.KEYWORDS.map(([key,label])=>({key,label,value:(g[key]||[]).join('\n')}))});}
    if(!c)return;
    this.setData({name:c.name,city:c.city||'',district:c.district||'',address:c.address||'',propertyName:c.propertyName||'',federationGroupId:c.federationGroupId||'',
      platformRate:c.rates&&c.rates.platform!==undefined?String(c.rates.platform):'',propertyRate:c.rates&&c.rates.property!==undefined?String(c.rates.property):'',
      location:c.location||null,locationText:c.location?`${c.location.lat}, ${c.location.lng}`:'未设置',petCertRequired:(c.requiredCerts||[]).includes('pet'),
      helpModeIndex:c.prices&&c.prices.help&&c.prices.help.billingMode==='per_visit'?1:0,stations:form.copy(c.stations||[]),canteens:form.copy(c.canteens||[]),dutyWindows:form.copy(c.dutyWindows||[]),priceRows:form.fields(form.PRICE_FIELDS,c.prices||{}),
      holidayDates:(c.prices&&c.prices.pet&&c.prices.pet.holidayDates||[]).join('\n'),
      recycleRows:form.CATEGORIES.map(([key,label])=>({key,label,...((c.prices&&c.prices.recycle&&c.prices.recycle.categories||{})[key]||{})})),
      plans:(c.cardPlans||[]).map(v=>({original:v,kindIndex:form.PLANS.findIndex(t=>t.code===v.code),name:v.name,price:String(v.price),firstPeriodPrice:String(v.firstPeriodPrice),days:String(v.days),dailyParcelQuota:v.dailyParcelQuota||'',weekdays:(v.schedule&&v.schedule.weekdays||[]).join(',')})),buildingId:'',buildingName:'',buildingUnits:''});
    if(this.editDraft?.ownerId===ownerId&&this.editDraft.communityId===c._id){this.setData(this.editDraft.data);this.editDraft=null;}
  },
  async chooseCommunity(event){if(!this.currentAdmin()||this.data.saving)return;this.setData({loading:true,error:'',canReload:false,authorized:false,community:null});try{await this.selectCommunity(Number(event.detail.value));if(this.currentAdmin())this.setData({authorized:true});}catch(e){if(this.currentAdmin())this.setData({error:e.message,canReload:true});}finally{if(this.currentAdmin())this.setData({loading:false});}},
  input(event){if(this.currentAdmin()&&this.data.authorized)this.setData({[event.currentTarget.dataset.field]:event.detail.value});},
  rowInput(event){if(!this.currentAdmin()||!this.data.authorized)return;const {list,index,field}=event.currentTarget.dataset;if(!['stations','canteens','dutyWindows','priceRows','globalRows','keywordRows','plans','recycleRows'].includes(list))return;this.setData({[`${list}[${index}].${field}`]:event.detail.value});},
  addRow(event){const list=event.currentTarget.dataset.list;const defaults={stations:{code:'',name:''},canteens:{code:'',name:'',merchantId:''},dutyWindows:{start:'',end:''},plans:{original:{},kindIndex:0,name:'垃圾月卡',price:'',firstPeriodPrice:'',days:'',dailyParcelQuota:'',weekdays:''}};if(defaults[list])this.setData({[list]:[...this.data[list],defaults[list]]});},
  removeRow(event){const {list,index}=event.currentTarget.dataset;if(['stations','canteens','dutyWindows','plans'].includes(list))this.setData({[list]:this.data[list].filter((_,i)=>i!==Number(index))});},
  choosePlan(event){const i=Number(event.currentTarget.dataset.index),kindIndex=Number(event.detail.value);this.setData({[`plans[${i}].kindIndex`]:kindIndex,[`plans[${i}].name`]:form.PLANS[kindIndex].name});},
  chooseHelpMode(event){const index=Number(event.detail.value);if(!this.data.saving&&[0,1].includes(index))this.setData({helpModeIndex:index});},
  togglePetCert(event){this.setData({petCertRequired:event.detail.value});},
  async chooseLocation(){if(!this.currentAdmin())return;const sequence=this.sequence;try{const point=await new Promise((resolve,reject)=>wx.chooseLocation({success:resolve,fail:reject}));if(this.currentAdmin(sequence))this.setData({location:{lat:point.latitude,lng:point.longitude},locationText:point.name||`${point.latitude}, ${point.longitude}`});}catch(e){if(this.currentAdmin(sequence)&&!String(e.errMsg).includes('cancel'))this.setData({error:'无法选择小区位置，请确认定位授权',canReload:false});}},
  showSaveError(message) {
    this.setData({ error: message, canReload: false }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    });
  },
  async refreshSavedCommunity(communityId) {
    this.setData({ refreshCommunityId: communityId, refreshError: '' });
    try {
      const result = await api.call('admin', 'managementConfig', { communityId }, { loading: false, silent: true });
      if (!this.data.community || this.data.community._id !== communityId) return;
      if (!result.community || result.community._id !== communityId) throw new Error('小区回读结果不匹配');
      // Refresh canonical data only: editable drafts, including other forms, stay intact.
      this.setData({ community: result.community, communities: result.communities,
        communityIndex: Math.max(0, result.communities.findIndex(item => item._id === communityId)),
        refreshCommunityId: '', refreshError: '' });
    } catch (error) {
      if (!this.data.community || this.data.community._id !== communityId) return;
      this.setData({ refreshError: '已保存，刷新失败，请重试刷新。', canReload: false }, () => {
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
      });
    }
  },
  async retrySavedRefresh() {
    if (!this.currentAdmin() || !this.data.authorized || this.data.saving || !this.data.refreshCommunityId) return;
    this.setData({ saving: true });
    try { await this.refreshSavedCommunity(this.data.refreshCommunityId); }
    finally { this.setData({ saving: false }); }
  },
  async saveCommunity(){if(!this.currentAdmin()||!this.data.authorized||this.data.saving||this.data.refreshCommunityId||!this.data.community)return;const sequence=this.sequence;this.setData({saving:true,error:'',canReload:false});try{
    const d=this.data,prices=form.pricePatch(d.community.prices,d.priceRows,d.helpModeIndex===1?'per_visit':'per15min');
    if(d.holidayDates.trim() || prices.pet&&prices.pet.holidayDates) {prices.pet=prices.pet||{};prices.pet.holidayDates=d.holidayDates.split(/[,，\s]+/).filter(Boolean);}
    for(const row of d.recycleRows){if(![row.pointsPerKg,row.purchaseFenPerKg,row.recyclerId].some(v=>v!==undefined&&String(v)!==''))continue;prices.recycle=prices.recycle||{};prices.recycle.categories=prices.recycle.categories||{};prices.recycle.categories[row.key]={pointsPerKg:form.number(row.pointsPerKg,'积分'),purchaseFenPerKg:form.number(row.purchaseFenPerKg,'收购价'),recyclerId:(row.recyclerId||'').trim()};}
    const requiredCerts=(d.community.requiredCerts||[]).filter(v=>v!=='pet');if(d.petCertRequired)requiredCerts.push('pet');
    const rates=form.copy(d.community.rates);if(d.platformRate!==''||d.propertyRate!==''){if(d.platformRate===''||d.propertyRate==='')throw new Error('请同时填写平台和物业费率');rates.platform=Number(d.platformRate);rates.property=Number(d.propertyRate);}
    const payload={communityId:d.community._id,name:d.name,city:d.city,district:d.district,address:d.address,propertyName:d.propertyName,prices,dutyWindows:d.dutyWindows,stations:d.stations,canteens:d.canteens.map(v=>({...v,merchantId:v.merchantId||null})),cardPlans:form.plans(d.plans),requiredCerts,federationGroupId:d.federationGroupId.trim()||null,...(Object.keys(rates).length?{rates}:{}),...(d.location?{location:d.location}:{})};
    await api.call('admin','updateCommunity',payload);if(!this.currentAdmin(sequence))return;wx.showToast({title:'小区配置已保存',icon:'success'});await this.refreshSavedCommunity(d.community._id);
  }catch(e){if(this.currentAdmin(sequence))this.showSaveError(e.message||'保存失败，输入已保留');}finally{if(this.currentAdmin(sequence))this.setData({saving:false});}},
  async saveGlobal(){if(!this.currentAdmin()||!this.data.authorized||this.data.saving||this.data.refreshCommunityId)return;const sequence=this.sequence;this.setData({saving:true,error:'',canReload:false});try{const patch={hotline:this.data.hotline.trim()};for(const row of this.data.globalRows)if(row.value!=='')patch[row.key]=form.number(row.value,row.label);for(const row of this.data.keywordRows)patch[row.key]=[...new Set(row.value.split('\n').map(v=>v.trim()).filter(Boolean))];await api.call('admin','updateConfig',patch);if(this.currentAdmin(sequence))wx.showToast({title:'全局配置已保存',icon:'success'});}catch(e){if(this.currentAdmin(sequence))this.showSaveError(e.message||'保存失败，输入已保留');}finally{if(this.currentAdmin(sequence))this.setData({saving:false});}},
  editBuilding(event){const b=(this.data.community.buildings||[]).find(v=>v._id===event.currentTarget.dataset.id);if(b)this.setData({buildingId:b._id,buildingName:b.name,buildingUnits:b.units.join('，')});},
  newBuilding(){this.setData({buildingId:'',buildingName:'',buildingUnits:''});},
  async addBuilding(){if(!this.currentAdmin()||!this.data.authorized||this.data.saving||this.data.refreshCommunityId||!this.data.community)return;const sequence=this.sequence;this.setData({saving:true,error:'',canReload:false});try{const units=this.data.buildingUnits.split(/[,，\n]+/).map(v=>v.trim()).filter(Boolean);const communityId=this.data.community._id;const saved=await api.call('admin','upsertBuilding',{communityId,buildingId:this.data.buildingId||undefined,name:this.data.buildingName.trim(),units});if(!this.currentAdmin(sequence))return;this.setData({buildingId:saved.buildingId});wx.showToast({title:'楼栋已保存',icon:'success'});await this.refreshSavedCommunity(communityId);}catch(e){if(this.currentAdmin(sequence))this.showSaveError(e.message||'楼栋保存失败');}finally{if(this.currentAdmin(sequence))this.setData({saving:false});}}
});
