self.addEventListener('push', event => {
  let data={title:'Friends Team Alarm',body:'You have an alarm.'};
  try{data=event.data.json()}catch(e){}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,tag:data.tag||'friends-team-alarm',requireInteraction:true,data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus();}return clients.openWindow(event.notification.data?.url||'/')}));});
