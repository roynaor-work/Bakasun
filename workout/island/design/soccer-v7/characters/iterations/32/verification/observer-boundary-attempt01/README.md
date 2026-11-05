# Preserved observer-boundary failure

The first final32 matrix attempt used observer e6cfdcb7. Two completed P01 near/far reports failed only its new matched-entry clock guard at a zero-time request supersession; their physical gates passed. The continuing get_up source was incorrectly treated as a new entry. No production runtime/model defect was inferred.

The owned queue was terminated gracefully, with cleanup stillLive empty. Its reports, driver log and journal are preserved here. A corrected observer32d05ea2 passed32 controlled fixtures and the exact failing actual-package case. The complete matrix restarts from zero under verification/final32/, with a new immutable input snapshot and no reused reports.
