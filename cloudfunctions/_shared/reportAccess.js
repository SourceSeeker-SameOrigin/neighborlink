const {ensure}=require('./validate');
const {isEnabled}=require('./features');
const {canViewContent,visibleCommunityIds}=require('./visibility');
function contentOwner(target) { return target && (target.authorOpenid || target.sellerOpenid || target.openid || target.from || target.ownerOpenid || target.createdBy || (target.staffOpenids||[])[0]); }
async function reportAccess(type,target,{user,openid},server) {
  ensure(target,'内容不存在','E_FORBIDDEN');
  ensure(contentOwner(target)!==openid && !(type==='merchant'&&(target.staffOpenids||[]).includes(openid)),'不能举报自己的内容');
  if(type==='message') {
    const conversation=await server.get('conversations',target.convId);
    ensure(conversation && Array.isArray(conversation.members) && conversation.members.includes(openid),'无权举报此会话消息','E_FORBIDDEN');
    if(conversation.type==='order') {const order=await server.get('orders',conversation.refId);ensure(order&&(order.userOpenid===openid||order.providerOpenid===openid),'已不再参与该订单','E_FORBIDDEN');}
    else if(conversation.type==='idle') {
      const item=await server.get('idleItems',conversation.refId);
      ensure(item&&conversation.members.includes(item.sellerOpenid),'会话归属已变化','E_FORBIDDEN');
      const viewer=await server.get('communities',user.communityId),source=await server.get('communities',item.communityId);
      ensure(viewer&&source&&viewer.status==='active'&&source.status==='active','小区暂不可用','E_FORBIDDEN');
      const config=await server.config();
      const same=viewer._id===source._id;
      const federated=item.scope==='federation'&&viewer.federationGroupId&&viewer.federationGroupId===source.federationGroupId&&isEnabled('federation',config,viewer)&&isEnabled('federation',config,source);
      ensure(same||federated,'无权举报此闲置会话','E_FORBIDDEN');
      await server.feature('idle',viewer._id);await server.feature('idle',source._id);await server.feature('chat',viewer._id);
    }
    else ensure(false,'会话类型不正确','E_FORBIDDEN');
    ensure(target.from && conversation.members.includes(target.from),'消息归属不正确','E_FORBIDDEN');
    await server.feature('chat',conversation.communityId);return conversation.communityId;
  }
  const community=await server.get('communities',user.communityId);
  ensure(community&&community.status==='active','请先绑定有效小区','E_FORBIDDEN');
  const config=await server.config();
  if(type==='merchant') {
    ensure(target.status==='approved' && (target.communityIds||[]).includes(community._id),'无权举报该商家','E_FORBIDDEN');
    await server.feature('merchants',community._id);return community._id;
  }
  if(type==='event') {
    ensure((target.communityIds||[]).includes(community._id) && target.status!=='draft','无权举报该活动','E_FORBIDDEN');
    await server.feature('events',community._id);return community._id;
  }
  const parent=type==='comment'?await server.get('posts',target.postId):target;
  const source=parent&&await server.get('communities',parent.communityId);
  ensure(source&&source.status==='active','内容不可见','E_FORBIDDEN');
  let ids=[community._id];
  if(isEnabled('federation',config,community)&&isEnabled('federation',config,source))ids=visibleCommunityIds('federation',community,[community,source]);
  // Hidden content can still receive the same reporter's idempotent retry; no content is disclosed here.
  ensure(canViewContent({...parent,moderationHidden:false},ids,{communityId:community._id,paidTask:parent.type==='task'}),'内容不在可见范围','E_FORBIDDEN');
  if(type==='post'||type==='comment') {
    if(parent.type==='task'){const order=await server.get('orders',parent.orderId);ensure(order&&!['pending_pay','pending_quote','closed'].includes(order.status),'任务未公开','E_FORBIDDEN');}
    await server.feature('board',source._id);
  } else if(type==='idle') {ensure(['on_sale','reserved','sold'].includes(parent.status),'闲置不可举报','E_FORBIDDEN');await server.feature('idle',source._id);}
  else ensure(false,'不支持举报此内容');
  return source._id;
}
module.exports={reportAccess,contentOwner};
