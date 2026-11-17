def pair_sum(nums, target):
    seen = set()
    for n in nums:
        need = target - n
        if need in seen:
            return (need, n)
        seen.add(n)
    return None
