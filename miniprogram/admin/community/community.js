const api = require('../../utils/api');
const form = require('./form');
const { fingerprint } = require('../../utils/intent-fingerprint');
Page({
  data: { loading:true,saving:false,error:'',canReload:false,refreshCommunityId:'',refreshError:'',community:null,communities:[],communityIndex:0,authorized:false,priceRows:[],globalRows:[],keywordRows:[],planOptions:form.PLANS,
    helpModeIndex:0,helpModes:['按每15分钟计价','按次计价（超时不自动扣费）'],stations:[],dutyWindows:[],canteens:[],plans:[],recycleRows:[],buildingId:'',buildingName:'',buildingUnits:'',buildingRecovery:'',buildingRecoveryHint:'',petCertRequired:false },
  onLoad(){return this.load();},
  onShow(){this.hidden=false;if(this.wasHidden){this.wasHidden=false;return this.load();}},
  onHide(){this.rememberDraft();this.hidden=true;this.wasHidden=true;this.sequence=(this.sequence||0)+1;this.loadSequence=(this.loadSequence||0)+1;this.clearPrivate();},
  onUnload(){this.closed=true;this.sequence=(this.sequence||0)+1;this.clearPrivate();},
  rememberDraft(){if(!this.currentAdmin()||!this.data.community)return;const keys=['name','city','district','address','propertyName','federationGroupId',
    'platformRate','propertyRate','location','locationText','petCertRequired','helpModeIndex','stations','canteens','dutyWindows',
    'priceRows','holidayDates','recycleRows','plans','buildingId','buildingName','buildingUnits','hotline','globalRows','keywordRows'];
    this.editDraft={ownerId:this.ownerId,communityId:this.data.community._id,data:Object.fromEntries(keys.map(key=>[key,this.data[key]]))};},
  clearPrivate(){this.setData({authorized:false,community:null,communities:[],priceRows:[],globalRows:[],keywordRows:[],
    stations:[],dutyWindows:[],canteens:[],plans:[],recycleRows:[],saving:false,refreshCommunityId:'',refreshError:'',
    buildingId:'',buildingName:'',buildingUnits:'',buildingRecovery:'',buildingRecoveryHint:''});this.ownerId=null;this.ownerCommunityId=null;this.globalLoaded=false;this.buildingRequest=null;},
  currentAdmin(sequence=this.sequence){const user=getApp().globalData.user;return !this.hidden&&!this.closed&&
    sequence===this.sequence&&!!this.ownerId&&user?._id===this.ownerId&&
    user.communityId===this.ownerCommunityId&&user.roles?.includes('admin');},
  async load() {
    const sequence=this.loadSequence=(this.loadSequence||0)+1;
    if(this.ownerId&&getApp().globalData.user?._id!==this.ownerId)this.clearPrivate();
    this.setData({loading:true,error:'',canReload:false,authorized:false});
    try { const user=await getApp().ensureSession();if(this.hidden||this.closed||sequence!==this.loadSequence)return;
      if(!user?._id||getApp().globalData.user?._id!==user._id||
        getApp().globalData.user?.communityId!==user.communityId)throw new Error('登录身份已变化，请重新加载');
      if(!user.roles?.includes('admin')||!getApp().globalData.user?.roles?.includes('admin'))throw new Error('只有运营管理员可以修改配置');
      this.ownerId=user._id;this.ownerCommunityId=user.communityId;await this.selectCommunity(this.data.communityIndex);
      if(this.hidden||this.closed||sequence!==this.loadSequence)return;
      if(getApp().globalData.user?._id!==user._id||getApp().globalData.user?.communityId!==user.communityId||
        !getApp().globalData.user?.roles?.includes('admin'))throw new Error('登录身份已变化，请重新加载');
      if(this.currentAdmin()&&this.data.community){this.setData({authorized:true});this.restoreBuildingRequest();await this.checkOriginalBuilding();} }
    catch(error){if(!this.hidden&&!this.closed&&sequence===this.loadSequence){this.clearPrivate();this.setData({error:error.message || '配置加载失败',canReload:true});}}
    finally{if(!this.hidden&&!this.closed&&sequence===this.loadSequence)this.setData({loading:false});}
  },
  async selectCommunity(index) {
    const sequence=(this.sequence||0)+1;this.sequence=sequence;
    const ownerId=this.ownerId,ownerCommunityId=this.ownerCommunityId;
    const result=await api.call('admin','managementConfig',{communityId:(this.data.communities[index]||{})._id||
      (this.editDraft?.ownerId===ownerId?this.editDraft.communityId:undefined)},{loading:false,silent:true});
    if(sequence!==this.sequence||this.hidden||this.closed||getApp().globalData.user?._id!==ownerId||
      getApp().globalData.user?.communityId!==ownerCommunityId)return;
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
  async chooseCommunity(event){if(!this.currentAdmin()||this.data.saving)return;this.setData({loading:true,error:'',canReload:false,authorized:false,community:null});try{await this.selectCommunity(Number(event.detail.value));if(this.currentAdmin()){this.setData({authorized:true});this.restoreBuildingRequest();await this.checkOriginalBuilding();}}catch(e){if(this.currentAdmin())this.setData({error:e.message,canReload:true});}finally{if(this.currentAdmin())this.setData({loading:false});}},
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
    const sequence = this.sequence;
    if (!this.currentAdmin(sequence)) return;
    this.setData({ refreshCommunityId: communityId, refreshError: '' });
    try {
      const result = await api.call('admin', 'managementConfig', { communityId }, { loading: false, silent: true });
      if (!this.currentAdmin(sequence) || !this.data.community || this.data.community._id !== communityId) return;
      if (!result.community || result.community._id !== communityId) throw new Error('小区回读结果不匹配');
      // Refresh canonical data only: editable drafts, including other forms, stay intact.
      this.setData({ community: result.community, communities: result.communities,
        communityIndex: Math.max(0, result.communities.findIndex(item => item._id === communityId)),
        refreshCommunityId: '', refreshError: '' });
    } catch (error) {
      if (!this.currentAdmin(sequence) || !this.data.community || this.data.community._id !== communityId) return;
      this.setData({ refreshError: '已保存，刷新失败，请重试刷新。', canReload: false }, () => {
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
      });
    }
  },
  async retrySavedRefresh() {
    if (!this.currentAdmin() || !this.data.authorized || this.data.saving || !this.data.refreshCommunityId) return;
    const sequence = this.sequence;
    this.setData({ saving: true });
    try { await this.refreshSavedCommunity(this.data.refreshCommunityId); }
    finally { if (this.currentAdmin(sequence)) this.setData({ saving: false }); }
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
  buildingStorageKey() { return 'building_create:' + this.ownerId + ':' + this.data.community?._id; },
  restoreBuildingRequest() {
    if (!this.currentAdmin() || !this.data.community) return;
    this.buildingRequest = null; this.buildingLookupChecked = false;
    try {
      const saved = wx.getStorageSync(this.buildingStorageKey());
      if (saved?.userId === this.ownerId && saved.communityId === this.data.community._id) this.buildingRequest = saved;
    } catch (_) {}
  },
  clearBuildingRequest() {
    if (this.buildingRequest && this.currentAdmin()) try {
      const key = this.buildingStorageKey();
      if (wx.getStorageSync(key)?.requestId === this.buildingRequest.requestId) wx.removeStorageSync(key);
    } catch (_) {}
    this.buildingRequest = null; this.buildingLookupChecked = false;
    this.setData({ buildingRecovery: '', buildingRecoveryHint: '' });
  },
  async checkOriginalBuilding() {
    if (!this.currentAdmin() || !this.data.authorized || !this.buildingRequest) return;
    const sequence = this.sequence, communityId = this.data.community._id, ownerId = this.ownerId;
    try {
      const result = await api.call('admin','lookupBuildingCreate', { communityId, requestId: this.buildingRequest.requestId },
        { loading:false, silent:true, redirectOnForbidden:false,
          isActive: () => this.currentAdmin(sequence) && this.ownerId === ownerId && this.data.community?._id === communityId });
      if (!this.currentAdmin(sequence) || this.ownerId !== ownerId || this.data.community?._id !== communityId) return;
      this.buildingLookupChecked = true;
      if (result.buildingId) {
        this.setData({ buildingId: result.buildingId, buildingName: result.name || '',
          buildingUnits: (result.units || []).join('，'), buildingRecovery: 'found',
          buildingRecoveryHint: '已找到上次创建的楼栋，可继续编辑原楼栋。', error: '' });
        await this.refreshSavedCommunity(communityId);
      } else this.setData({ buildingRecovery: 'confirm',
        buildingRecoveryHint: '未查到原楼栋，请核对原名称和单元后沿原编号重试。', error: '' });
    } catch (error) {
      if (this.currentAdmin(sequence)) this.setData({ buildingRecovery: 'lookup',
        buildingRecoveryHint: '楼栋创建结果待核对，请先重试读取。', error: error.message || '原楼栋核对失败' });
    }
  },
  editBuilding(event){const b=(this.data.community.buildings||[]).find(v=>v._id===event.currentTarget.dataset.id);if(b){this.clearBuildingRequest();this.setData({buildingId:b._id,buildingName:b.name,buildingUnits:b.units.join('，')});}},
  newBuilding(){if(!this.currentAdmin())return;
    if(this.buildingRequest&&(!this.buildingLookupChecked||this.data.buildingRecovery==='lookup')){
      this.setData({error:'请先核对上次楼栋创建结果'});return;}
    this.clearBuildingRequest();this.setData({buildingId:'',buildingName:'',buildingUnits:''});},
  async addBuilding(){if(!this.currentAdmin()||!this.data.authorized||this.data.saving||this.data.refreshCommunityId||!this.data.community)return;
    if(this.data.buildingRecovery==='lookup'||(this.buildingRequest&&!this.buildingLookupChecked)){this.setData({error:'请先核对上次楼栋创建结果'});return;}
    const sequence=this.sequence;this.setData({saving:true,error:'',canReload:false});try{
      const units=[...new Set(this.data.buildingUnits.split(/[,，\n]+/).map(v=>v.trim()).filter(Boolean))];
      const communityId=this.data.community._id,name=this.data.buildingName.trim();
      if(!this.data.buildingId){
        const intentHash=fingerprint({communityId,name,units});
        if(this.buildingRequest&&this.buildingRequest.intentHash!==intentHash)throw new Error('楼栋内容与上次创建不同，请核对原输入或明确填写新楼栋');
        if(!this.buildingRequest){this.buildingRequest={userId:this.ownerId,communityId,requestId:Date.now().toString(36)+'_'+Math.random().toString(36).slice(2),intentHash};
          wx.setStorageSync(this.buildingStorageKey(),this.buildingRequest);}
      }
      const saved=await api.call('admin','upsertBuilding',{communityId,buildingId:this.data.buildingId||undefined,
        requestId:this.data.buildingId?undefined:this.buildingRequest.requestId,name,units});
      if(!this.currentAdmin(sequence))return;
      this.setData({buildingId:saved.buildingId,buildingRecovery:this.buildingRequest?'found':'',
        buildingRecoveryHint:this.buildingRequest?'已找到原楼栋，可继续编辑。':'',error:''});
      wx.showToast({title:'楼栋已保存',icon:'success'});await this.refreshSavedCommunity(communityId);
    }catch(e){if(this.currentAdmin(sequence)){
      if(this.buildingRequest&&!this.data.buildingId)await this.checkOriginalBuilding();
      if(this.currentAdmin(sequence)&&this.data.buildingRecovery!=='found')this.showSaveError(e.message||'楼栋保存失败');
    }}finally{if(this.currentAdmin(sequence))this.setData({saving:false});}}
});
