// Brute force approach

// time complexity = o(n)
// space complexity = o(n)

let nums = [0,1,0,3,12]
let result = []

for(let i=0;i<nums.length;i++){
    if(nums[i]!=0){
        result.push(nums[i])
    }
}

let zeroCount = nums.length - result.length

for(let j=0; j<zeroCount;j++){
    result.push(0)
}

for ( let i=0; i<nums.length;i++){
    nums[i]=result[i]
}

console.log(nums)



// optimal approach




