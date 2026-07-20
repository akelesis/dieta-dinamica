alter table public.profiles
  add column reproductive_status text not null default 'none'
  check (reproductive_status in (
    'none',
    'pregnant_first_trimester',
    'pregnant_second_trimester',
    'pregnant_third_trimester',
    'breastfeeding_0_6_months',
    'breastfeeding_7_12_months'
  ));

alter table public.profiles
  add constraint profiles_reproductive_status_matches_sex
  check (sex = 'female' or reproductive_status = 'none');
