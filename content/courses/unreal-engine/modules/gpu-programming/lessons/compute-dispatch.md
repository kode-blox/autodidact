---
# Copyright 2026 Sayak Mukhopadhyay
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

id: "05-02"
course: ue584
title: "Compute dispatch and thread groups"
description: "Derive dispatch group counts and guard excess invocations."
---

Required foundations: [05-01 Shader stages resources and bindings](/courses/ue584/05-01) These are guidance links; this lesson is always accessible.
## Summary
Our compute shader will write one result for every pixel in a 17-by-10 image. We need 170 valid writes. The dispatch interface, however, asks us for groups of invocations rather than an arbitrary list of 170 pixels. Let us work out how to cover the image using an 8-by-8 group.
## Cover the width, then the height
One 8-by-8 group covers eight columns and eight rows. Two groups across cover sixteen columns, leaving the seventeenth column untouched. We need a third group across even though most of that last group's columns will lie outside the image.

In height, one group covers eight rows. A second reaches sixteen and includes the remaining two valid rows. The dispatch therefore asks for three groups across and two down: `Dispatch(3,2,1)`.

Each group contains 64 invocations, so six groups create `6*64 = 384` invocations. The output has only 170 pixels. The difference, 214, consists of invocations beyond its right or lower edge. Those invocations are expected; the shader must prevent them from accessing pixels outside the valid output.

This gives the general calculation. For a valid width W and group width T, use `ceil(W/T)` groups. With positive integer sizes, a common expression is `(W+T-1)/T` using integer division, with the usual requirement that the addition not overflow. Unreal supplies helpers so callers can express this directly.
## Find one invocation within the grid
How does an invocation know which pixel it should process? HLSL supplies several related IDs. `SV_GroupID` identifies its group. `SV_GroupThreadID` identifies its location within that group. Their combination gives the global dispatch ID:
```text
dispatchID = groupID * threadsPerGroup + groupThreadID.
```
For our 8-by-8 groups, group `(1,0)` begins at global coordinate `(8,0)`. An invocation at local coordinate `(2,3)` in that group has global coordinate `(10,3)`. `SV_DispatchThreadID` supplies the combined result, so a simple image kernel can use its x and y components as pixel coordinates.

The attribute `[numthreads(8,8,1)]` describes the size *inside* one group. The host's `Dispatch(3,2,1)` describes the number of groups. These two declarations work together. Changing the HLSL group width without changing the host's group-count calculation can leave part of an image untouched or launch an unintended extent.
## Let the excess invocations return
For an independent-pixel operation, a simple guard is enough:
```hlsl
if (any(DispatchId.xy >= ImageSize))
    return;
```
Place it before any access that needs those image bounds. In the 17-by-10 example, the invocation with ID `(16,9)` is valid and writes the final column of the final row. `(17,9)` is outside the width, and `(16,10)` is outside the height. Both return.

What if the host uses ordinary truncated division instead? It would launch only two groups across and one down: a 16-by-8 region. That covers 128 pixels and misses 42 valid pixels. A bounds guard cannot fix missing work because those invocations never existed. Rounding upward and guarding excess work solve different parts of the same problem.
## Add the viewport origin at the right point
An output image may occupy only a rectangle inside a larger texture. Suppose that rectangle begins at allocation coordinate `(20,30)`. Dispatch ID `(4,5)` should then write allocation coordinate `(24,35)`.

We can check the relative ID against the rectangle's size before adding its origin. Alternatively, we can check the resulting absolute coordinate against matching absolute limits. Mixing a relative ID with an absolute maximum can admit writes outside the intended rectangle. The baseline downsample kernel will give us a concrete example of keeping these meanings separate.

Group dimensions are logical indexing choices, not a promise that the GPU runs groups left-to-right or executes a logical row as one hardware wave. Begin with a straightforward shape. Later, profiling can compare alternatives appropriate to the algorithm and device. Our browser grid makes no claims about occupancy or execution time.
## Practical lab
Use [Compute dispatch](/experiments/ue584/compute-dispatch). This is a coverage model: we are checking which pixels receive work, not measuring GPU speed.

1. Press **Reset experiment**. Confirm output width 17, height 10, group width **8 × 8**, and both checkboxes enabled. Before reading the counts, calculate groups `(ceil(17/8),ceil(10/8))=(3,2)`. Six groups launch 384 invocations; 170 correspond to image pixels and 214 lie outside. Check all four numbers in the results panel.
2. Uncheck **Round group counts upward**, keeping the bounds guard enabled. The model now dispatches `(2,1,1)`, covering only 16×8 pixels. Record 128 valid writes and 42 uncovered pixels. The guard cannot create the missing work.
3. Re-enable rounding upward, then uncheck **Guard out-of-bounds invocations**. Coverage returns to 170 valid pixels, but the model now reports 214 invalid write attempts. Re-enable the guard. This demonstrates a different failure from step 2.
4. Set width and height to 16, leaving 8×8 groups and both checks enabled. You should obtain four groups, 256 invocations, and no excess. Change only width to 17: six groups now launch 384 invocations for 272 valid pixels, leaving 112 excess. Record both rows; one extra column requires two extra groups in this case.
5. On paper, map relative invocation `(4,5)` into a viewport whose origin is `(20,30)`. The allocation coordinate is `(24,35)`. The browser has no viewport-origin control, so this last calculation belongs in your notes rather than in its controls.

**You are finished when** your notes distinguish uncovered pixels from excess invocations and contain the `(24,35)` coordinate calculation. For the source connection, the `GetGroupCount` source link below shows Unreal's round-up helper; you can read that small function without tracing the entire dispatch machinery.


<details>
<summary>Which control fixes which failure?</summary>

Rounding upward supplies enough invocations to cover the image. The bounds guard prevents the excess invocations from writing outside it. Each addresses a different side of the coverage problem.

</details>
## Checkpoint
Given an image size and group size, derive the group counts and the exact valid region. Explain the bounds check as a consequence of that calculation. Then map a relative dispatch ID to a nonzero-origin output rectangle without mixing their coordinate conventions.
## Sources
- [inline FIntVector GetGroupCount(const FIntPoint& ThreadCount, const FIntPoint& GroupSize) in the pinned baseline](https://github.com/EpicGames/UnrealEngine/blob/f45729c0b6f097038e72b52d366a62baeca3275b/Engine/Source/Runtime/RenderCore/Public/RenderGraphUtils.h#L346-L352)
- [void MainCS in the pinned baseline](https://github.com/EpicGames/UnrealEngine/blob/f45729c0b6f097038e72b52d366a62baeca3275b/Engine/Shaders/Private/PostProcessDownsample.usf#L87-L98)
- [Microsoft numthreads reference](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/sm5-attributes-numthreads)
- [Microsoft SV_DispatchThreadID reference](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/sv-dispatchthreadid)
## Related
Course glossary *(not published in this preview)* · Progress and resume record *(not published in this preview)*
