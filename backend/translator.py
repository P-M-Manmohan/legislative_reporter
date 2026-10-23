
import json
import os
import time

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("TRANSLATION_MODEL", "gpt-4o-mini")
BATCH_SIZE = 10
CONTEXT_SIZE = 2

client = OpenAI()


def translate_segments(segments: list[dict]) -> list[dict]:
    """
    Translate Malayalam transcript segments using neighboring context.

    Each input segment should contain:
        start_seconds, end_seconds, text

    Returns the same segments with text_english added.
    """
    if not segments:
        return []

    output = [dict(segment) for segment in segments]

    for batch_start in range(0, len(segments), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(segments))

        # Include surrounding segments to provide sentence context.
        context_start = max(0, batch_start - CONTEXT_SIZE)
        context_end = min(
            len(segments),
            batch_end + CONTEXT_SIZE,
        )

        payload = []

        for index in range(context_start, context_end):
            payload.append({
                "id": index,
                "text": segments[index]["text"],
                "translate": batch_start <= index < batch_end,
            })

        expected_ids = set(range(batch_start, batch_end))

        response = client.chat.completions.create(
            model=MODEL,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You translate Malayalam legislative proceedings "
                        "into accurate English. The input contains "
                        "consecutive timestamped transcript fragments. "
                        "A fragment may begin or end in the middle of a "
                        "sentence. Use neighboring fragments to understand "
                        "the full meaning, grammatical structure, names, "
                        "pronouns, negation, and political terminology.\n\n"
                        "Translate each item marked translate=true into "
                        "English. Return exactly one translation for each "
                        "such item, preserving its ID. Do not translate "
                        "items marked translate=false; they are context "
                        "only.\n\n"
                        "Translate faithfully. Do not summarize, invent "
                        "missing words, add facts, or change the speaker's "
                        "meaning. Preserve uncertainty and negation. "
                        "Each translation should correspond to its "
                        "original segment, even if it is a sentence "
                        "fragment. Do not duplicate words from neighboring "
                        "segments merely to make the translation sound "
                        "complete.\n\n"
                        "Return valid JSON in this format: "
                        '{"translations":[{"id":0,"text_english":"..."}]}'
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        payload,
                        ensure_ascii=False,
                    ),
                },
            ],
        )

        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("Empty translation response")

        result = json.loads(content)
        items = result.get("translations")

        if not isinstance(items, list):
            raise RuntimeError("Invalid translation response structure")

        translated_by_id = {}

        for item in items:
            if not isinstance(item, dict):
                continue

            item_id = item.get("id")
            english = item.get("text_english")

            if (
                isinstance(item_id, int)
                and item_id in expected_ids
                and isinstance(english, str)
                and english.strip()
            ):
                translated_by_id[item_id] = english.strip()

        
            missing_ids = expected_ids - set(translated_by_id)

            # Retry incomplete batches up to two times.
            for attempt in range(2):
                if not missing_ids:
                    break

                print(
                    f"Retrying missing segment IDs: {sorted(missing_ids)} "
                    f"(attempt {attempt + 1}/2)"
                )

                retry_payload = [
                    {
                        "id": index,
                        "text": segments[index]["text"],
                        "translate": True,
                    }
                    for index in sorted(missing_ids)
                ]

                retry_response = client.chat.completions.create(
                    model=MODEL,
                    temperature=0,
                    response_format={"type": "json_object"},
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Translate every supplied Malayalam transcript "
                                "fragment into accurate English. Preserve the "
                                "given IDs exactly. Return one translation for "
                                "every input item, without omissions. Do not "
                                "summarize or add information. Return JSON: "
                                '{"translations":[{"id":0,"text_english":"..."}]}'
                            ),
                        },
                        {
                            "role": "user",
                            "content": json.dumps(
                                retry_payload,
                                ensure_ascii=False,
                            ),
                        },
                    ],
                )

                retry_content = retry_response.choices[0].message.content
                if not retry_content:
                    continue

                try:
                    retry_items = json.loads(retry_content).get("translations", [])
                except (json.JSONDecodeError, AttributeError):
                    continue

                for item in retry_items:
                    if not isinstance(item, dict):
                        continue

                    item_id = item.get("id")
                    english = item.get("text_english")

                    if (
                        isinstance(item_id, int)
                        and item_id in missing_ids
                        and isinstance(english, str)
                        and english.strip()
                    ):
                        translated_by_id[item_id] = english.strip()

                missing_ids = expected_ids - set(translated_by_id)

            if missing_ids:
                raise RuntimeError(
                    "Still missing translations for segment IDs: "
                    + ", ".join(map(str, sorted(missing_ids)))
                )


        for index, english in translated_by_id.items():
            output[index]["text_english"] = english

        print(
            f"Translated segments {batch_start + 1}-"
            f"{batch_end} of {len(segments)}"
        )

        # Brief pause between requests.
        time.sleep(0.3)

    return output

