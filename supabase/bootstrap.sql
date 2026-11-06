-- מריצים אחרי schema.sql ואחרי שיצרתם משתמשים ב-Authentication → Users.
-- יוצר את העסק "Baka San" ומצרף אליו רק את המשתמשים ברשימה המפורשת למטה (לא את כל מי שנרשם לפרויקט).
-- להוספת אדם: מוסיפים את המייל שלו לרשימה ומריצים שוב; כל חבר אחר נשאר כמו שהוא.
insert into orgs (name) select 'Baka San' where not exists (select 1 from orgs where name = 'Baka San');
insert into members (org_id, user_id, role)
select o.id, u.id, case when u.email = 'roynaor@gmail.com' then 'admin' else 'producer' end
from auth.users u, orgs o
where o.name = 'Baka San'
  and u.email in ('roynaor@gmail.com', 'info.virpro@gmail.com')
on conflict do nothing;
select u.email, m.role from members m join auth.users u on u.id = m.user_id;
