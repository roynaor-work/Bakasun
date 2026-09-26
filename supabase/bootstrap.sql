-- מריצים אחרי schema.sql ואחרי שיצרתם משתמשים ב-Authentication → Users.
-- יוצר את העסק "Baka San" ומצרף אליו את כל המשתמשים שקיימים בפרויקט.
insert into orgs (name) select 'Baka San' where not exists (select 1 from orgs where name = 'Baka San');
insert into members (org_id, user_id, role)
select o.id, u.id, case when u.email = 'roynaor@gmail.com' then 'admin' else 'producer' end
from auth.users u, orgs o where o.name = 'Baka San'
on conflict do nothing;
select u.email, m.role from members m join auth.users u on u.id = m.user_id;
