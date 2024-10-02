class Node {
    constructor(value){
        this.value = value;
        this.next = null;
    }
}

class LinkedList {
    constructor(){
        this.head = null;
        this.size = 0;
    }
    isEmpty(){
        return this.size === 0;
    }
    getSize(){
        return this.size;
    }
    prepend(value){
        const node = new Node(value);
        if(this.isEmpty()){
            this.head = node;
        }else{
            node.next = this.head;
            this.head = node;
        }
        this.size++ ;
    }
    append(value){
        const node = new Node(value);
        if(this.isEmpty()){
            this.head = node;
        }else{
            let pre = this.head;
            while(pre.next){
                pre = pre.next;
            }
            pre.next = node;
        }
        this.size++ ;
    }
    print(){
        let curr = this.head;
        let listValues = '';
        while(curr){
            listValues += `${curr.value} `
            curr = curr.next
        }
        console.log(listValues)
    }
}

const list = new LinkedList()
list.prepend(10)
list.prepend(20)
list.prepend(30)
list.append(40)
list.append(235)
list.print()
