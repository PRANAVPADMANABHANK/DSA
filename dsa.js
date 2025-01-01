const array = [1,2,3,4,5]

for(let nums of array){
    console.log(nums*2)

}
console.log("-----------")

array.map((value, index, array)=>{
    console.log(value*2)
})

console.log("-----------")

array.forEach((value, index)=>{
    console.log(value*2)
})

console.log("-----------")

const newArr1 = array.map((value, index, array)=>{
    return value*10;
})

console.log(newArr1)