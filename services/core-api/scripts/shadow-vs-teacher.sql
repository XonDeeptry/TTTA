-- "Đo → Đếm → Viết" (Idea/20261003-DoDemViet.md) — so band NGẦM với điểm giáo viên.
--
-- Điểm giáo viên = `reviewed_scores` (giáo viên đã sửa) hoặc `scores` của bài ĐÃ GỬI (giáo viên
-- duyệt nguyên). Chỉ tính bài IELTS đã gửi và có `shadow_bands`. Chạy trên pilot:
--   docker compose exec -T postgres psql -U ilm -d ilm -f - < shadow-vs-teacher.sql
-- Quyết định giai đoạn 2→3: band ngầm phải khớp giáo viên TỐT HƠN điểm AI hiện tại (cột `hits`, `mae`).
with rows as (
  select g.submission_id,
         d.key as criterion,
         (g.assessment->'shadow_bands'->>d.key)::numeric as shadow,
         (g.scores->d.key->>'score')::numeric as ai,
         (coalesce(g.reviewed_scores, g.scores)->d.key->>'score')::numeric as teacher
  from gradings g
  join criteria c on c.id = g.criteria_id
  cross join lateral jsonb_object_keys(g.assessment->'shadow_bands') as d(key)
  where c.template_key = 'ielts_speaking' and g.sent_at is not null and g.assessment ? 'shadow_bands'
)
select criterion,
       count(*) as n,
       sum((shadow = teacher)::int) as shadow_hits,
       round(avg(abs(shadow - teacher)), 2) as shadow_mae,
       round(avg(shadow - teacher), 2) as shadow_bias,
       sum((ai = teacher)::int) as ai_hits,
       round(avg(abs(ai - teacher)), 2) as ai_mae,
       round(avg(ai - teacher), 2) as ai_bias
from rows
where teacher is not null
group by criterion
order by criterion;
