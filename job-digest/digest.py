#!/usr/bin/env python3
"""Fetch Moscow hh.ru vacancies and render the daily HTML digest."""

from __future__ import annotations

import html
import json
import re
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import parse_applications as apps

MSK = timezone(timedelta(hours=3))
HERE = Path(__file__).resolve().parent

QUERIES = [
    "коммерческий директор",
    "операционный директор",
    "директор по продажам",
    "руководитель e-commerce",
    "CCO",
    "COO",
    "исполнительный директор",
    "Head of Sales",
    "директор по электронной коммерции",
    "Head of e-commerce",
]

TITLE_KEEP = re.compile(
    r"(коммерческ\w*\s+директор|операционн\w*\s+директор|\bCCO\b|\bCOO\b|"
    r"директор по продажам|head of sales|sales director|"
    r"исполнительн\w*\s+директор|\bCEO\b|"
    r"e-?commerce|ecom|электронн\w*\s+коммерц|"
    r"директор по сбыту|директор по развитию продаж|"
    r"руководитель (отдела |направления |департамента )?(продаж|e-?com|электрон)|"
    r"head of e-?com|директор по электронной)",
    re.I,
)


def unescape(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def parse_salary(text: str) -> tuple[tuple[int | None, int | None, str] | None, str]:
    blob = re.sub(r"\s+", " ", (text or "").replace("\xa0", " ")).strip()
    if not blob or not re.search(r"\d", blob):
        return None, "не указана"
    currency = "₽" if "₽" in blob else ("$" if "$" in blob else ("€" if "€" in blob else None))
    if currency is None:
        return None, "не указана"
    nums = []
    for raw in re.findall(r"\d[\d\s]*", blob):
        try:
            value = int(raw.replace(" ", ""))
        except ValueError:
            continue
        if value >= 1000:
            nums.append(value)
    if not nums:
        return None, "не указана"
    low = high = None
    lowercased = blob.lower()
    has_range = any(mark in blob for mark in ("–", "—", "-", "−"))
    if lowercased.startswith("до"):
        high = nums[0]
    elif has_range and len(nums) >= 2:
        low, high = nums[0], nums[1]
    elif lowercased.startswith("от"):
        low = nums[0]
        if len(nums) >= 2:
            high = nums[1]
    elif len(nums) >= 2:
        low, high = nums[0], nums[1]
    else:
        low = nums[0]

    def fmt(value: int) -> str:
        return f"{value:,}".replace(",", " ")

    if low and high:
        pretty = f"{fmt(low)} – {fmt(high)} {currency}"
    elif low:
        pretty = f"от {fmt(low)} {currency}"
    elif high:
        pretty = f"до {fmt(high)} {currency}"
    else:
        pretty = "не указана"
    return (low, high, currency), pretty


def is_relevant(title: str) -> bool:
    lowered = title.lower()
    if not TITLE_KEEP.search(title):
        return False
    if re.search(r"ассистент|помощник|стажер|стажёр|референт|junior", lowered):
        return False
    if re.search(r"\bменеджер\b", lowered) and not re.search(r"директор|руководитель|head of|cco|coo|ceo", lowered):
        return False
    if re.search(
        r"\b(cfo|cpo)\b|финансовый директор|директор по продукту|директор по маркетингу|"
        r"head of marketing|head of performance|to coo|chief of staff|руководитель проектов",
        lowered,
    ):
        return False
    return True


def salary_excluded(parsed) -> bool:
    if not parsed:
        return False
    _low, high, currency = parsed
    return currency == "₽" and high is not None and high <= 300_000


def parse_search_html(page_html: str) -> list[dict]:
    rows = []
    for part in page_html.split('data-qa="serp-item__title"')[1:]:
        url_match = re.search(r'href="(https://hh.ru/vacancy/\d+)', part)
        title_match = re.search(r'data-qa="serp-item__title-text"[^>]*>(.*?)</span>', part, re.S)
        employer_match = re.search(
            r'data-qa="vacancy-serp__vacancy-employer-text"[^>]*>(.*?)</span>', part, re.S
        ) or re.search(r'data-qa="vacancy-serp__vacancy-employer"[^>]*>(.*?)</a>', part, re.S)
        addr_match = re.search(r'data-qa="vacancy-serp__vacancy-address"[^>]*>(.*?)</span>', part, re.S)
        if not url_match or not title_match:
            continue
        url = url_match.group(1)
        title = unescape(title_match.group(1))
        company = re.sub(r"\s+", " ", unescape(employer_match.group(1)) if employer_match else "")
        address = unescape(addr_match.group(1)) if addr_match else ""
        after = part.split('data-qa="serp-item__title-text"', 1)[-1]
        after = after.split('data-qa="vacancy-serp__vacancy-employer"', 1)[0]
        after_text = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", after)))
        salary_text = after_text[len(title) :] if after_text.startswith(title) else after_text
        salary_text = salary_text.split("Опыт")[0].split("Выплаты")[0]
        parsed, pretty = parse_salary(salary_text)
        rows.append(
            {
                "id": url.rsplit("/", 1)[-1],
                "title": title,
                "company": company,
                "salary": pretty,
                "salary_parsed": parsed,
                "url": url,
                "addr": address,
            }
        )
    return rows


def fetch_hh() -> list[dict]:
    import subprocess

    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    )
    seen: set[str] = set()
    vacancies = []
    for query in QUERIES:
        params = {
            "text": query,
            "area": "1",
            "search_field": "name",
            "order_by": "publication_time",
            "ored_clusters": "true",
            "hhtmFrom": "vacancy_search_list",
            "items_on_page": "50",
        }
        url = "https://hh.ru/search/vacancy?" + urllib.parse.urlencode(params)
        result = subprocess.run(
            ["curl", "-sS", "-L", "-A", user_agent, url],
            capture_output=True,
            text=True,
            check=False,
        )
        for row in parse_search_html(result.stdout):
            if row["id"] in seen:
                continue
            if not is_relevant(row["title"]) or salary_excluded(row["salary_parsed"]):
                continue
            if row["addr"] and "москва" not in row["addr"].lower():
                continue
            seen.add(row["id"])
            vacancies.append(row)
    vacancies.sort(key=lambda row: int(row["id"]), reverse=True)
    return vacancies


def match_bucket(company: str, companies: list[dict]) -> dict | None:
    key = apps.company_key(company)
    if not key:
        return None
    exact = [row for row in companies if row["key"] == key]
    if exact:
        return exact[0]
    for row in companies:
        other = row["key"]
        if not other:
            continue
        if key in other or other in key:
            if min(len(key), len(other)) >= 6:
                return row
    return None


def split_vacancies(vacancies: list[dict], companies: list[dict]) -> dict[str, list[dict]]:
    grouped = {"new": [], "applied": [], "rejected": []}
    for vacancy in vacancies:
        match = match_bucket(vacancy["company"], companies)
        vacancy = dict(vacancy)
        if not match:
            grouped["new"].append(vacancy)
            continue
        vacancy["match_company"] = match["company"]
        vacancy["match_date"] = match["date"]
        vacancy["match_status"] = match["status"]
        if match["bucket"] == "отказ":
            grouped["rejected"].append(vacancy)
        else:
            grouped["applied"].append(vacancy)
    return grouped


def table_html(rows: list[dict], mark: str | None = None) -> str:
    header = (
        "<table border='1' cellpadding='6' cellspacing='0' "
        "style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px'>"
        "<tr>"
        "<th style='font-style:italic'>Должность</th>"
        "<th style='font-style:italic'>Компания</th>"
        "<th style='font-style:italic'>Зарплата</th>"
        "<th style='font-style:italic'>Ссылка</th>"
        "</tr>"
    )
    body = []
    for row in rows:
        company = html.escape(row["company"])
        if mark:
            company = f"{company}<br><span style='color:#666'>{html.escape(mark)}</span>"
        body.append(
            "<tr>"
            f"<td>{html.escape(row['title'])}</td>"
            f"<td>{company}</td>"
            f"<td>{html.escape(row['salary'])}</td>"
            f"<td><a href='{html.escape(row['url'])}'>{html.escape(row['url'])}</a></td>"
            "</tr>"
        )
    if not body:
        body.append("<tr><td colspan='4'>Нет вакансий в этой группе</td></tr>")
    return header + "".join(body) + "</table>"


def applications_table_html(companies: list[dict]) -> str:
    header = (
        "<table border='1' cellpadding='6' cellspacing='0' "
        "style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px'>"
        "<tr>"
        "<th style='font-style:italic'>Компания</th>"
        "<th style='font-style:italic'>Дата</th>"
        "<th style='font-style:italic'>Статус</th>"
        "</tr>"
    )
    rows = []
    for row in companies:
        date_fmt = datetime.strptime(row["date"], "%Y-%m-%d").strftime("%d.%m.%Y")
        rows.append(
            "<tr>"
            f"<td>{html.escape(row['company'])}</td>"
            f"<td>{date_fmt}</td>"
            f"<td>{html.escape(row['status'])}</td>"
            "</tr>"
        )
    return header + "".join(rows) + "</table>"


def render_email(grouped: dict[str, list[dict]], companies: list[dict], day: date) -> tuple[str, str]:
    title = f"Вакансии Москва — {day.strftime('%d.%m.%Y')}"
    applied_mark = "уже откликался"
    rejected_mark = "был отказ"
    html_body = f"""
<p style="font-family:Arial,sans-serif;font-size:16px"><b>{html.escape(title)}</b></p>
<p style="font-family:Arial,sans-serif;font-size:14px">Новые вакансии</p>
{table_html(grouped['new'])}
<p style="font-family:Arial,sans-serif;font-size:14px;margin-top:24px"><b>Уже откликался</b></p>
{table_html(grouped['applied'], mark=applied_mark)}
<p style="font-family:Arial,sans-serif;font-size:14px;margin-top:24px"><b>Был отказ</b></p>
{table_html(grouped['rejected'], mark=rejected_mark)}
"""
    return title, html_body


def main() -> None:
    data_path = HERE / "applications.json"
    if not data_path.exists():
        apps.main()
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    companies = payload["companies"]
    vacancies = fetch_hh()
    grouped = split_vacancies(vacancies, companies)
    today = datetime.now(MSK).date()
    subject, html_body = render_email(grouped, companies, today)
    (HERE / "last_email.html").write_text(html_body, encoding="utf-8")
    (HERE / "last_digest.json").write_text(
        json.dumps(
            {
                "subject": subject,
                "counts": {key: len(value) for key, value in grouped.items()},
                "grouped": grouped,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(subject)
    print({key: len(value) for key, value in grouped.items()})


if __name__ == "__main__":
    main()
