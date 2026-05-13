import asyncio
import asyncpg
import uuid

async def main():
    eng = await asyncpg.connect(host='postgres', user='postgres', password='postgres', database='engagement')
    learning = await asyncpg.connect(host='postgres', user='postgres', password='postgres', database='learning')
    rows = await eng.fetch("""
        SELECT question_id::text, predicted_correct, actual_correct::int
          FROM analytics_schema.confidence_calibration
         WHERE user_id = $1
    """, uuid.UUID('00000000-0000-0000-0000-000000000001'))
    print(f'{len(rows)} ratings')
    qids = [r[0] for r in rows]
    concepts = await learning.fetch("""
        SELECT question_id::text, concept_id::text
          FROM content_schema.question_concepts
         WHERE role = 'primary' AND question_id = ANY($1::uuid[])
    """, qids)
    print(f'{len(concepts)} concept tags found')
    by_concept = {}
    q_to_c = {c[0]: c[1] for c in concepts}
    for r in rows:
        cid = q_to_c.get(r[0])
        if cid:
            by_concept.setdefault(cid, []).append(r)
    print(f'distinct concepts: {len(by_concept)}')
    for cid, items in sorted(by_concept.items(), key=lambda x: -len(x[1]))[:5]:
        print(f'  {cid[:8]}: {len(items)} ratings')
    await eng.close()
    await learning.close()

asyncio.run(main())
