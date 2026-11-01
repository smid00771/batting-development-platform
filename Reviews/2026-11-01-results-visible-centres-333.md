# Results visible centres and readable player text — .333

The .332 layout used the result/margin column to centre the totals, instead of the visible light gaps beside the wider grade banner. Centred layouts now calculate the total positions from the actual banner edges. Left-hand player names share the left total centre. Right-hand names remain centre-aligned in their own name column, independently of the total, with a separate left-aligned figures column. Mixed-opponent layouts use the scaled banner width.

The corrected name columns and smaller internal side padding fit Newcastle City’s supplied four-grade list at a uniform 24px instead of 21px, keeping every full name, figure and not-out marker. The saved artwork, panel dimensions, club settings and match facts are unchanged.

Validation: focused Results geometry, full-name/readability, reference, preview/save and refinement checks; native canvas before/after preview with the supplied names and figures; browser review; rebuilt shared-module demo and freshness check. No database or Edge Function update is needed. Existing saved images remain unchanged; newly created Results graphics use this layout.
