from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
from app.models.entities import BrowserObservationModel
from app.schemas.observation_schemas import (
    BrowserObservationSchema,
    ConsentComparisonSummary,
    ConsentConnectionDiff
)


class ObservationService:
    @staticmethod
    def compare_consent_sessions(
        scan_id: str,
        target_url: str,
        observations: List[BrowserObservationModel]
    ) -> ConsentComparisonSummary:
        """
        Compares observed network connections across consent states:
        - consent_accepted
        - consent_rejected
        Identifies connections occurring in both, only in accepted, or only in rejected.
        """
        accepted_map: Dict[str, BrowserObservationModel] = {}
        rejected_map: Dict[str, BrowserObservationModel] = {}

        for obs in observations:
            key = f"{obs.method}:{obs.url}"
            if obs.consent_state == "consent_accepted":
                accepted_map[key] = obs
            elif obs.consent_state == "consent_rejected":
                rejected_map[key] = obs

        observed_both: List[ConsentConnectionDiff] = []
        only_accepted: List[ConsentConnectionDiff] = []
        only_rejected: List[ConsentConnectionDiff] = []

        all_keys = set(accepted_map.keys()).union(set(rejected_map.keys()))

        for key in all_keys:
            acc = accepted_map.get(key)
            rej = rejected_map.get(key)
            ref_obs = acc or rej
            if not ref_obs:
                continue

            diff_entry = ConsentConnectionDiff(
                url=ref_obs.url,
                domain=ref_obs.domain,
                method=ref_obs.method,
                classification=ref_obs.classification,
                resourceType=ref_obs.resource_type,
                statusInAccepted=acc.status_code if acc else None,
                statusInRejected=rej.status_code if rej else None,
                evidenceObservationIds=[o.id for o in (acc, rej) if o]
            )

            if acc and rej:
                observed_both.append(diff_entry)
            elif acc:
                only_accepted.append(diff_entry)
            elif rej:
                only_rejected.append(diff_entry)

        summary_text = (
            f"Observed {len(observed_both)} connection(s) common across both consent states; "
            f"{len(only_accepted)} connection(s) observed exclusively when consent was accepted; "
            f"{len(only_rejected)} connection(s) observed when consent was rejected."
        )

        return ConsentComparisonSummary(
            scanId=scan_id,
            targetUrl=target_url,
            observedInBoth=observed_both,
            observedOnlyInAccepted=only_accepted,
            observedOnlyInRejected=only_rejected,
            summaryText=summary_text
        )


observation_service = ObservationService()
