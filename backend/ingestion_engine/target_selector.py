import random

_RISK_TYPES = {"geopolitical_tariff", "logistics_disruption", "climate_disruption"}


async def select_targets(db) -> list[dict]:
    """
    Shuffles suppliers with active orders, matches each to a risk_catalog entry by region,
    and returns up to one (supplier, risk) pair per risk_type.
    """
    suppliers = await db["suppliers"].find({"has_active_orders": True}).to_list(length=None)
    random.shuffle(suppliers)

    covered = set()
    results = []

    for supplier in suppliers:
        remaining = _RISK_TYPES - covered
        if not remaining:
            break

        risks = await db["risk_catalog"].find({
            "applies_to_regions": {"$in": [supplier["region"]]},
            "risk_type": {"$in": list(remaining)},
        }).to_list(length=None)

        if not risks:
            continue

        risk = random.choice(risks)
        results.append({"supplier": supplier, "risk": risk})
        covered.add(risk["risk_type"])

    return results
