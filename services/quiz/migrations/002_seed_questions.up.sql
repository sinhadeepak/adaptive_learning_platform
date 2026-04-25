-- Minimal Sprint 2 seed: 3 topics × 5 questions, mixed IRT difficulty.
-- Topic UUIDs match catalog seed (cross-DB convention; no FK).
--   33333333-0000-0000-0000-000000000001 = JEE Main / Physics / Mechanics
--   33333333-0000-0000-0000-000000000002 = JEE Main / Physics / Thermodynamics
--   33333333-0000-0000-0000-000000000006 = JEE Main / Mathematics / Calculus

INSERT INTO quiz_schema.questions (id, topic_id, stem, choices, correct_idx, difficulty_b, language, status) VALUES
  -- Mechanics
  ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001',
   'A car accelerates from rest at 2 m/s² for 5 s. What is its final velocity?',
   '["5 m/s","10 m/s","15 m/s","20 m/s"]'::jsonb, 1, -1.5, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000001',
   'A 2 kg object moving at 3 m/s collides elastically with a stationary 4 kg object. What is the velocity of the 2 kg object after collision?',
   '["-1 m/s","1 m/s","2 m/s","3 m/s"]'::jsonb, 0, 0.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000001',
   'The work done by gravity on a 1 kg object falling 10 m (g = 10 m/s²) is:',
   '["1 J","10 J","100 J","1000 J"]'::jsonb, 2, -1.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000001',
   'Two masses 4 kg and 6 kg are connected by a string over a frictionless pulley. The acceleration of the system is:',
   '["g/5","2g/5","g/10","g/2"]'::jsonb, 0, 1.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000001',
   'A particle in uniform circular motion has angular velocity ω. Its angular momentum about the center, with mass m and radius r, is:',
   '["mωr","mωr²","mω²r","mω²r²"]'::jsonb, 1, 1.5, 'en', 'PUBLISHED'),

  -- Thermodynamics
  ('44444444-0000-0000-0000-000000000006','33333333-0000-0000-0000-000000000002',
   'The first law of thermodynamics is a statement of conservation of:',
   '["mass","momentum","energy","charge"]'::jsonb, 2, -2.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000007','33333333-0000-0000-0000-000000000002',
   'For an ideal gas at constant temperature, doubling the volume causes pressure to:',
   '["double","halve","quadruple","stay the same"]'::jsonb, 1, -1.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000008','33333333-0000-0000-0000-000000000002',
   'A Carnot engine operates between 400 K and 300 K. Its efficiency is:',
   '["10%","25%","50%","75%"]'::jsonb, 1, 0.5, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-000000000009','33333333-0000-0000-0000-000000000002',
   'In an adiabatic process for an ideal gas, which quantity is conserved?',
   '["temperature","pressure","heat exchanged with surroundings","none of the above"]'::jsonb, 2, 1.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-00000000000a','33333333-0000-0000-0000-000000000002',
   'The molar heat capacity at constant volume Cv for a diatomic ideal gas (rigid rotator) is:',
   '["3R/2","5R/2","7R/2","R"]'::jsonb, 1, 1.5, 'en', 'PUBLISHED'),

  -- Calculus
  ('44444444-0000-0000-0000-00000000000b','33333333-0000-0000-0000-000000000006',
   'd/dx (x²) =',
   '["x","2x","x²","2"]'::jsonb, 1, -2.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-00000000000c','33333333-0000-0000-0000-000000000006',
   '∫ 1/x dx =',
   '["ln|x| + C","x ln x + C","-1/x² + C","x² + C"]'::jsonb, 0, -0.5, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-00000000000d','33333333-0000-0000-0000-000000000006',
   'lim_{x→0} sin(x)/x =',
   '["0","1","∞","undefined"]'::jsonb, 1, 0.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-00000000000e','33333333-0000-0000-0000-000000000006',
   'd/dx (e^(x²)) =',
   '["e^(x²)","x e^(x²)","2x e^(x²)","2x e^x"]'::jsonb, 2, 1.0, 'en', 'PUBLISHED'),
  ('44444444-0000-0000-0000-00000000000f','33333333-0000-0000-0000-000000000006',
   '∫₀^π sin(x) dx =',
   '["0","1","2","π"]'::jsonb, 2, 0.5, 'en', 'PUBLISHED')
ON CONFLICT (id) DO NOTHING;
